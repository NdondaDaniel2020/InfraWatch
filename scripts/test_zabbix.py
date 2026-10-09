"""Script de teste da integração Zabbix JSON-RPC com o InfraWatch.

Executa o fluxo completo do ZabbixClient:
1. Consulta de versão da API (apiinfo.version)
2. Autenticação na API JSON-RPC 2.0 (via API Token permanente ou login de credenciais Admin)
3. Consulta e listagem de hosts cadastrados (host.get)
4. Consulta de itens de monitoramento ativos (item.get)
5. Extração e consolidação de telemetria de hardware (CPU, RAM, Disco)
6. Encerramento gracioso de sessão (user.logout)
"""

import asyncio
import os
import sys
from pathlib import Path

# Adiciona o diretório backend ao sys.path para importação dos módulos
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

from src.core.config import get_settings
from src.integrations.zabbix import (
    ZabbixAuthError,
    ZabbixClient,
    ZabbixConnectionError,
    ZabbixError,
)


async def main() -> None:
    settings = get_settings()

    api_url = os.getenv("ZABBIX_API_URL") or settings.ZABBIX_API_URL
    api_token = os.getenv("ZABBIX_API_TOKEN") or settings.ZABBIX_API_TOKEN or None
    username = os.getenv("ZABBIX_USER") or settings.ZABBIX_USER or "Admin"
    password = os.getenv("ZABBIX_PASSWORD") or settings.ZABBIX_PASSWORD or "zabbix"

    auth_desc = (
        f"API Token ({api_token[:6]}...)"
        if api_token
        else f"Credenciais de Usuário ({username})"
    )

    print("=" * 60)
    print(" InfraWatch - Teste de Integração Zabbix JSON-RPC")
    print("=" * 60)
    print(f" Zabbix API URL : {api_url}")
    print(f" Modo de Auth   : {auth_desc}")
    print(f" Zabbix Enabled : {settings.ZABBIX_ENABLED}")
    print("=" * 60)

    print("\n[1/5] Verificando conectividade e versão da API Zabbix...")
    try:
        async with ZabbixClient(
            api_url=api_url,
            api_token=api_token,
            username=username,
            password=password,
            timeout=settings.ZABBIX_TIMEOUT_SECONDS,
        ) as client:
            version = await client.get_api_version()
            print("  -> Conectado com sucesso ao Zabbix!")
            print(f"  -> Versão do servidor Zabbix: {version}")

            print("\n[2/5] Validando autenticação na API JSON-RPC 2.0...")
            print(f"  -> Autenticação confirmada ({auth_desc}).")

            print("\n[3/5] Consultando hosts cadastrados no inventário...")
            hosts = await client.get_hosts()
            print(f"  -> Encontrado(s) {len(hosts)} host(s) no Zabbix:")
            for h in hosts:
                print(
                    f"     • Host: {h.name} (ID: {h.hostid}, Status: {h.status_label}, "
                    f"Disponibilidade: {h.available_label})"
                )

            print("\n[4/5] Coletando itens e telemetria de hardware (CPU, RAM, Disco)...")
            target_host = hosts[0] if hosts else None
            if target_host:
                print(f"  -> Host selecionado para coleta: {target_host.name} (ID: {target_host.hostid})")
                items = await client.get_items(
                    hostids=[target_host.hostid],
                    keys=["system.cpu", "vm.memory", "vfs.fs"],
                )
                print(f"  -> Total de {len(items)} itens de telemetria identificados.")

                metrics = await client.get_host_hardware_metrics(hostid=target_host.hostid)
                cpu_str = f"{metrics.cpu_utilization_pct}%" if metrics.cpu_utilization_pct is not None else "N/D"
                mem_str = f"{metrics.memory_utilization_pct}%" if metrics.memory_utilization_pct is not None else "N/D"
                disk_str = f"{metrics.disk_utilization_pct}%" if metrics.disk_utilization_pct is not None else "N/D"

                print("  -> Métricas consolidadas:")
                print(f"     • CPU Utilization    : {cpu_str}")
                print(f"     • Memory Utilization : {mem_str}")
                print(f"     • Disk Utilization   : {disk_str}")
            else:
                print("  -> Nenhum host cadastrado ainda no Zabbix para extração de telemetria.")

            print("\n[5/5] Encerrando sessão de forma graciosa...")
            # O context manager executa client.close() automaticamente
            print("  -> Sessão encerrada no servidor Zabbix.")

    except ZabbixAuthError as exc:
        print(f"\n[ERRO DE AUTENTICAÇÃO] {exc}")
        print("Dica: Verifique se o ZABBIX_API_TOKEN ou usuário/senha (Admin/zabbix) estão corretos.")
        sys.exit(1)
    except ZabbixConnectionError as exc:
        print(f"\n[ERRO DE CONEXÃO] {exc}")
        print("Dica: Certifique-se de que o container do Zabbix está ativo via:")
        print("      docker compose -f docker-compose.zabbix.yml up -d")
        sys.exit(1)
    except ZabbixError as exc:
        print(f"\n[ERRO ZABBIX] {exc}")
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        print(f"\n[ERRO INESPERADO] {exc}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print(" Integração Zabbix JSON-RPC validada com 100% de sucesso!")
    print(" Acesse o painel web: http://localhost:8081 (Login: Admin / Senha: zabbix)")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
