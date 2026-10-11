#!/usr/bin/env python3
"""Script de teste do subsistema de notificações multicanal do InfraWatch.

Permite validar o funcionamento dos canais de notificação (Telegram, WhatsApp,
Webhooks e SMTP) e do NotificationDispatcher, tanto em modo simulado (dry-run/mock)
quanto disparando alertas reais para credenciais configuradas no ambiente (.env).

Uso:
    python scripts/test_notifications.py --dry-run
    python scripts/test_notifications.py --channel telegram --severity CRITICAL
    python scripts/test_notifications.py --channel all
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

# Adiciona o diretório backend ao sys.path para importação dos módulos
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

from src.core.config import get_settings
from src.integrations.notifications import (
    AlertMessage,
    AlertSeverity,
    NotificationDispatcher,
    SmtpNotificationChannel,
    TelegramChannel,
    WebhookChannel,
    WhatsAppChannel,
)


def create_sample_alert(severity: AlertSeverity) -> AlertMessage:
    """Gera um alerta de teste representativo."""
    downtime = 18.5 if severity == AlertSeverity.RESOLVED else None
    return AlertMessage(
        title=f"Teste de Infraestrutura - {severity.value}",
        description="Verificação de integridade operacional dos notificadores multicanal.",
        severity=severity,
        device_id=uuid4(),
        device_name="cr01.luanda.rcsangola.co.ao",
        device_ip="10.200.0.1",
        downtime_minutes=downtime,
    )


async def run_dry_run_tests() -> bool:
    """Executa suíte de validação sintética sem tráfego de rede externo."""
    print("\n" + "=" * 65)
    print(" [MODO DRY-RUN / SIMULAÇÃO] Validando Canais e Despachante")
    print("=" * 65)

    alert_critical = create_sample_alert(AlertSeverity.CRITICAL)
    alert_resolved = create_sample_alert(AlertSeverity.RESOLVED)

    # 1. Validação de Formatação
    print("\n[1/4] Testando formatação de sumário e mensagens...")
    summary = alert_critical.format_summary()
    assert "[CRITICAL]" in summary
    assert "cr01.luanda.rcsangola.co.ao" in summary
    print("  -> Sumário de texto simples formatado com sucesso.")

    resolved_summary = alert_resolved.format_summary()
    assert "18.5 minutos" in resolved_summary
    print("  -> Cálculo de downtime no alerta de resolução formatado com sucesso.")

    # 2. Validação dos Payloads de Canais
    print("\n[2/4] Testando serialização de payloads específicos...")
    wh_channel = WebhookChannel(webhook_url="https://discord.com/api/webhooks/mock")
    discord_payload = wh_channel.build_payload(alert_critical, "https://discord.com/api/webhooks/123")
    assert "embeds" in discord_payload
    print("  -> Payload Discord Embed gerado com sucesso.")

    slack_payload = wh_channel.build_payload(alert_critical, "https://hooks.slack.com/services/mock")
    assert "blocks" in slack_payload
    print("  -> Payload Slack Blocks gerado com sucesso.")

    smtp_channel = SmtpNotificationChannel(smtp_host="localhost")
    html_email = smtp_channel._render_html(alert_resolved)
    assert "18.5 minutos" in html_email
    print("  -> Template HTML de e-mail renderizado com sucesso.")

    # 3. Validação do Despachante e Roteamento por Severidade
    print("\n[3/4] Testando NotificationDispatcher com mocks isolados...")
    mock_tg = AsyncMock()
    mock_tg.name = "telegram"
    mock_tg.is_available.return_value = True
    mock_tg.send.return_value = True

    mock_wa = AsyncMock()
    mock_wa.name = "whatsapp"
    mock_wa.is_available.return_value = True
    mock_wa.send.return_value = True

    mock_wh = AsyncMock()
    mock_wh.name = "webhook"
    mock_wh.is_available.return_value = True
    mock_wh.send.return_value = True

    mock_smtp = AsyncMock()
    mock_smtp.name = "smtp"
    mock_smtp.is_available.return_value = True
    mock_smtp.send.return_value = True

    dispatcher = NotificationDispatcher(
        channels=[mock_tg, mock_wa, mock_wh, mock_smtp],
        max_retries=2,
        retry_delay_seconds=0.01,
    )

    res_crit = await dispatcher.dispatch_by_severity(alert_critical)
    assert len(res_crit) == 4
    assert all(res_crit.values())
    print("  -> Severidade CRITICAL despachada concorrentemente para todos os 4 canais.")

    alert_degraded = create_sample_alert(AlertSeverity.DEGRADED)
    res_deg = await dispatcher.dispatch_by_severity(alert_degraded)
    assert "smtp" not in res_deg
    print("  -> Severidade DEGRADED roteada corretamente para canais de degradação.")

    # 4. Validação da Política de Retentativas
    print("\n[4/4] Testando política de retentativas do Dispatcher...")
    flaky_channel = AsyncMock()
    flaky_channel.name = "telegram"
    flaky_channel.is_available.return_value = True
    flaky_channel.send.side_effect = [False, True]

    retry_dispatcher = NotificationDispatcher(
        channels=[flaky_channel],
        max_retries=2,
        retry_delay_seconds=0.01,
    )
    retry_res = await retry_dispatcher.dispatch(alert_critical, channels=["telegram"])
    assert retry_res.get("telegram") is True
    assert flaky_channel.send.await_count == 2
    print("  -> Retentativa bem-sucedida após falha transitória (tentativa 1=False, tentativa 2=True).")

    print("\n" + "=" * 65)
    print("  TODOS OS TESTES DRY-RUN FORAM CONCLUÍDOS COM SUCESSO!")
    print("=" * 65)
    return True


async def run_live_tests(
    target_channel: str,
    target_severity: AlertSeverity,
    recipient: str | None = None,
) -> bool:
    """Executa testes reais contra canais configurados no ambiente."""
    settings = get_settings()
    alert = create_sample_alert(target_severity)

    print("\n" + "=" * 65)
    print(" [MODO AO VIVO] Teste de Notificadores Multicanal")
    print("=" * 65)
    print(f" Severidade      : {target_severity.value}")
    print(f" Canal Alvo      : {target_channel.upper()}")
    print(f" Telegram Bot    : {'Configurado' if settings.TELEGRAM_BOT_TOKEN else 'Não configurado'}")
    print(f" WhatsApp Gateway: {'Ativo' if settings.WHATSAPP_ENABLED else 'Desabilitado'}")
    print(f" Webhook Default : {'Configurado' if settings.DEFAULT_WEBHOOK_URL else 'Não configurado'}")
    print(f" SMTP Host       : {settings.SMTP_HOST or 'Não configurado'}")
    print(f" SMTP Recipient  : {recipient or settings.SMTP_DEFAULT_RECIPIENT or 'Não configurado'}")
    print("=" * 65)

    dispatcher = NotificationDispatcher(
        channels=[
            TelegramChannel(),
            WhatsAppChannel(),
            WebhookChannel(),
            SmtpNotificationChannel(),
        ],
        max_retries=2,
        retry_delay_seconds=1.0,
    )

    channels_to_test = (
        dispatcher.registered_channels
        if target_channel == "all"
        else [target_channel]
    )

    recipients_map: dict[str, str] = {}
    if recipient:
        if target_channel == "all":
            recipients_map["smtp"] = recipient
            recipients_map["whatsapp"] = recipient
        else:
            recipients_map[target_channel] = recipient

    print(f"\nDisparando alerta para os canais: {channels_to_test}...")
    results = await dispatcher.dispatch(
        alert,
        channels=channels_to_test,
        recipients=recipients_map or None,
    )

    print("\nResultados do Envio:")
    all_success = True
    for ch_name, success in results.items():
        channel_obj = dispatcher.get_channel(ch_name)
        is_avail = await channel_obj.is_available() if channel_obj else False
        if not is_avail:
            print(f"  • {ch_name.upper():<12}: DESABILITADO (IGNORADO)")
            if target_channel != "all":
                all_success = False
        elif success:
            print(f"  • {ch_name.upper():<12}: SUCESSO")
        else:
            print(f"  • {ch_name.upper():<12}: FALHA")
            all_success = False

    return all_success


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Script de teste e validação das notificações multicanal do InfraWatch."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa validação sintética isolada com mocks (sem chamadas de rede externas).",
    )
    parser.add_argument(
        "--channel",
        choices=["all", "telegram", "whatsapp", "webhook", "smtp"],
        default="all",
        help="Canal específico a ser testado (padrão: all).",
    )
    parser.add_argument(
        "--severity",
        choices=["CRITICAL", "DEGRADED", "RESOLVED", "INFO"],
        default="CRITICAL",
        help="Severidade do alerta simulado (padrão: CRITICAL).",
    )
    parser.add_argument(
        "--recipient",
        type=str,
        default=None,
        help="Destinatário específico para o teste (ex: e-mail para SMTP ou telefone para WhatsApp).",
    )

    args = parser.parse_args()
    severity_enum = AlertSeverity(args.severity)

    if args.dry_run or (not args.dry_run and args.channel == "all" and not any([
        get_settings().TELEGRAM_BOT_TOKEN,
        get_settings().DEFAULT_WEBHOOK_URL,
        get_settings().SMTP_HOST,
        get_settings().WHATSAPP_ENABLED,
    ])):
        if not args.dry_run:
            print("[AVISO] Nenhuma credencial de notificação configurada no .env. Executando em modo --dry-run.")
        ok = await run_dry_run_tests()
    else:
        ok = await run_live_tests(
            target_channel=args.channel,
            target_severity=severity_enum,
            recipient=args.recipient,
        )

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
