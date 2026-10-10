#!/usr/bin/env python3
"""Script de teste e simulação de Webhooks do Zabbix para o InfraWatch.

Permite testar o endpoint /api/v1/integrations/zabbix/webhook em dois modos:
1. Modo --dry-run / --mock: Executa testes in-process com TestClient simulando
   autenticação segura, publicação no Redis Streams e controle de idempotência.
2. Modo ao vivo (live): Dispara requisições HTTP reais contra a API FastAPI em execução.

Uso:
    python scripts/test_zabbix_webhook.py --dry-run
    python scripts/test_zabbix_webhook.py --url http://localhost:8000/api/v1/integrations/zabbix/webhook --token meu-secret
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

# Adiciona o diretório backend ao sys.path para importação dos módulos
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.routes.zabbix_webhook import router
from src.core.config import get_settings
from src.core.infrastructure.redis import get_redis_client
from src.core.messaging import get_event_bus


def run_dry_run_tests() -> bool:
    """Executa suíte de validação sintética in-process com mocks."""
    print("\n" + "=" * 65)
    print(" [MODO DRY-RUN / SIMULAÇÃO] Validando Webhook do Zabbix")
    print("=" * 65)

    mock_redis = AsyncMock()
    mock_redis.set.return_value = True  # Primeira requisição: novo evento

    mock_bus = AsyncMock()
    mock_bus.publish.return_value = True

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_redis_client] = lambda: mock_redis
    app.dependency_overrides[get_event_bus] = lambda: mock_bus

    client = TestClient(app)
    test_secret = "test-zabbix-secret-key"

    with patch("src.api.routes.zabbix_webhook.get_settings") as mock_settings:
        mock_settings.return_value.ZABBIX_WEBHOOK_SECRET = test_secret

        # 1. Validação de Autenticação Segura (Rejeição de Token Inválido)
        print("\n[1/5] Testando rejeição de token inválido (401 Unauthorized)...")
        res_unauth = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json={"event_id": "1", "trigger_name": "T1", "host_name": "H1"},
            headers={"X-Zabbix-Webhook-Token": "token-errado"},
        )
        assert res_unauth.status_code == 401
        print("  -> Requisição não autorizada rejeitada com sucesso (401).")

        # 2. Disparo de Incidente Crítico (Disaster)
        print("\n[2/5] Testando ingestão de incidente crítico (Disaster)...")
        critical_payload = {
            "event_id": "10001",
            "event_value": 1,
            "event_severity": "Disaster",
            "trigger_name": "Link de Fibra Luanda-Benguela Inoperante",
            "host_name": "cr01.luanda.rcsangola.co.ao",
            "host_ip": "10.200.0.1",
            "operational_data": "Interface GigabitEthernet0/0/1 down",
            "occurred_at": "2026-10-10 19:40:00",
        }
        res_crit = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=critical_payload,
            headers={"X-Zabbix-Webhook-Token": test_secret},
        )
        assert res_crit.status_code == 200
        assert res_crit.json()["status"] == "processed"
        mock_bus.publish.assert_awaited()
        topic, event_data = mock_bus.publish.call_args[0]
        assert topic == "stream:incidents"
        assert event_data["severity"] == "CRITICAL"
        assert event_data["event_type"] == "IncidentTriggeredEvent"
        print("  -> Alerta crítico publicado no Redis Stream stream:incidents com sucesso.")

        # 3. Disparo de Degradação (Average)
        print("\n[3/5] Testando ingestão de alerta de degradação (Average)...")
        mock_bus.publish.reset_mock()
        degraded_payload = {
            "event_id": "10002",
            "event_value": 1,
            "event_severity": "Average",
            "trigger_name": "Uso de CPU acima do limite (>85%)",
            "host_name": "srv-radius-01",
            "operational_data": "CPU 91.2%",
        }
        res_deg = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=degraded_payload,
            headers={"X-Zabbix-Webhook-Token": test_secret},
        )
        assert res_deg.status_code == 200
        topic, event_data = mock_bus.publish.call_args[0]
        assert event_data["severity"] == "DEGRADED"
        assert event_data["event_type"] == "DeviceDegradedEvent"
        print("  -> Degradação mapeada e publicada com sucesso.")

        # 4. Disparo de Normalização / Resolução (EVENT.VALUE=0)
        print("\n[4/5] Testando evento de resolução de incidente (RESOLVED)...")
        mock_bus.publish.reset_mock()
        resolved_payload = {
            "event_id": "10003",
            "event_value": 0,
            "event_severity": "Disaster",
            "trigger_name": "Link de Fibra Luanda-Benguela Inoperante",
            "host_name": "cr01.luanda.rcsangola.co.ao",
        }
        res_res = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=resolved_payload,
            headers={"X-Zabbix-Webhook-Token": test_secret},
        )
        assert res_res.status_code == 200
        topic, event_data = mock_bus.publish.call_args[0]
        assert event_data["severity"] == "RESOLVED"
        assert event_data["event_type"] == "IncidentResolvedEvent"
        print("  -> Alerta de normalização publicado no stream com sucesso.")

        # 5. Garantia de Idempotência contra Duplicação de Alertas
        print("\n[5/5] Testando idempotência no Redis (alerta duplicado)...")
        mock_bus.publish.reset_mock()
        mock_redis.set.return_value = False  # Simula chave já existente no Redis

        res_dup = client.post(
            "/api/v1/integrations/zabbix/webhook",
            json=critical_payload,
            headers={"X-Zabbix-Webhook-Token": test_secret},
        )
        assert res_dup.status_code == 200
        assert res_dup.json()["status"] == "ignored"
        assert res_dup.json()["reason"] == "duplicate_event"
        mock_bus.publish.assert_not_awaited()
        print("  -> Alerta duplicado identificado e descartado sem gerar eventos redundantes.")

    print("\n" + "=" * 65)
    print("  TODOS OS TESTES DE INTEGRAÇÃO DO WEBHOOK PASSARAM COM SUCESSO!")
    print("=" * 65)
    return True


async def run_live_test(url: str, token: str) -> bool:
    """Dispara teste HTTP real contra endpoint ativo."""
    print("\n" + "=" * 65)
    print(" [MODO AO VIVO] Testando Endpoint Webhook do Zabbix")
    print("=" * 65)
    print(f" URL do Webhook  : {url}")
    print(f" Token Secreto   : {token[:4]}... ({len(token)} chars)")
    print("=" * 65)

    payload = {
        "event_id": "live-test-100",
        "event_value": 1,
        "event_severity": "High",
        "trigger_name": "Teste de Comunicação Webhook do Zabbix",
        "host_name": "cr01.luanda.rcsangola.co.ao",
        "host_ip": "10.200.0.1",
        "operational_data": "Simulação live CLI",
    }

    headers = {
        "Content-Type": "application/json",
        "X-Zabbix-Webhook-Token": token,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            print(f"\nResposta da API: HTTP {resp.status_code}")
            print(f"Payload de Retorno: {resp.text}")
            return resp.status_code == 200
    except (httpx.HTTPError, ConnectionError, TimeoutError, OSError) as exc:
        print(f"\n[ERRO] Falha ao comunicar com o servidor: {exc}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Script de teste e validação de Webhooks do Zabbix no InfraWatch."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa testes sintéticos isolados com mocks (in-process).",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000/api/v1/integrations/zabbix/webhook",
        help="URL completa do endpoint de webhook.",
    )
    parser.add_argument(
        "--token",
        default="",
        help="Token de autenticação X-Zabbix-Webhook-Token.",
    )

    args = parser.parse_args()
    settings = get_settings()
    token = args.token or settings.ZABBIX_WEBHOOK_SECRET

    if args.dry_run or not token:
        if not args.dry_run and not token:
            print("[AVISO] ZABBIX_WEBHOOK_SECRET não configurado. Executando em modo --dry-run.")
        ok = run_dry_run_tests()
    else:
        ok = asyncio.run(run_live_test(url=args.url, token=token))

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
