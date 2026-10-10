"""Testes unitários para o subsistema de notificações multicanal (Telegram, WhatsApp, Webhooks, SMTP)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest

from src.integrations.notifications import (
    AlertMessage,
    AlertSeverity,
    NotificationDispatcher,
    SmtpNotificationChannel,
    TelegramChannel,
    WebhookChannel,
    WhatsAppChannel,
    get_notification_dispatcher,
)


def make_http_response(status_code: int, text: str = "ok") -> MagicMock:
    """Helper para simular respostas httpx."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.text = text
    return resp


@pytest.fixture
def sample_alert() -> AlertMessage:
    return AlertMessage(
        title="Host Inacessível",
        description="O dispositivo não respondeu a 3 pings consecutivos.",
        severity=AlertSeverity.CRITICAL,
        device_id=uuid4(),
        device_name="Switch-Core-01",
        device_ip="192.168.10.1",
        downtime_minutes=15.5,
    )


# ============================================================================
# AlertMessage Model Tests
# ============================================================================


def test_alert_message_format_summary(sample_alert: AlertMessage) -> None:
    summary = sample_alert.format_summary()
    assert "[CRITICAL] Host Inacessível" in summary
    assert "Ativo: Switch-Core-01 (192.168.10.1)" in summary
    assert "15.5 minutos" in summary


def test_alert_message_minimal_format() -> None:
    alert = AlertMessage(
        title="Alerta Genérico",
        description="Sem ativos vinculados",
        severity=AlertSeverity.INFO,
    )
    summary = alert.format_summary()
    assert "[INFO] Alerta Genérico" in summary
    assert "Ativo:" not in summary
    assert "Tempo de indisponibilidade" not in summary


# ============================================================================
# Telegram Channel Tests
# ============================================================================


@pytest.mark.asyncio
async def test_telegram_channel_is_available() -> None:
    channel = TelegramChannel(bot_token="", default_chat_id="")
    assert await channel.is_available() is False

    channel_ready = TelegramChannel(bot_token="12345:TOKEN", default_chat_id="123456")
    assert await channel_ready.is_available() is True


@pytest.mark.asyncio
async def test_telegram_channel_send_missing_config(sample_alert: AlertMessage) -> None:
    channel = TelegramChannel(bot_token="", default_chat_id="")
    success = await channel.send(sample_alert)
    assert success is False


@pytest.mark.asyncio
async def test_telegram_channel_send_success(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = make_http_response(200, '{"ok": true}')

    channel = TelegramChannel(
        bot_token="12345:TEST_TOKEN",
        default_chat_id="-100987654",
        client=mock_client,
    )

    success = await channel.send(sample_alert)

    assert success is True
    mock_client.post.assert_awaited_once()
    called_url = mock_client.post.call_args[0][0]
    payload = mock_client.post.call_args[1]["json"]

    assert "api.telegram.org/bot12345:TEST_TOKEN/sendMessage" in called_url
    assert payload["chat_id"] == "-100987654"
    assert payload["parse_mode"] == "HTML"
    assert "🚨 <b>[CRITICAL] Host Inacessível</b>" in payload["text"]
    assert "192.168.10.1" in payload["text"]


@pytest.mark.asyncio
async def test_telegram_channel_send_http_error(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = make_http_response(400, "Bad Request")

    channel = TelegramChannel(
        bot_token="12345:TEST_TOKEN",
        default_chat_id="-100987654",
        client=mock_client,
    )

    success = await channel.send(sample_alert)
    assert success is False


@pytest.mark.asyncio
async def test_telegram_channel_send_exception(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.side_effect = httpx.ConnectTimeout("Timeout connecting")

    channel = TelegramChannel(
        bot_token="12345:TEST_TOKEN",
        default_chat_id="-100987654",
        client=mock_client,
    )

    success = await channel.send(sample_alert)
    assert success is False


# ============================================================================
# WhatsApp Channel Tests (Evolution API)
# ============================================================================


@pytest.mark.asyncio
async def test_whatsapp_channel_is_available() -> None:
    channel = WhatsAppChannel(gateway_url="", api_token="", default_recipient="", enabled=False)
    assert await channel.is_available() is False

    channel_disabled = WhatsAppChannel(
        gateway_url="http://evolution-api:8085/message/sendText/infrawatch",
        api_token="MY_TOKEN",
        default_recipient="244923000000",
        enabled=False,
    )
    assert await channel_disabled.is_available() is False

    channel_ready = WhatsAppChannel(
        gateway_url="http://evolution-api:8085/message/sendText/infrawatch",
        api_token="MY_TOKEN",
        default_recipient="244923000000",
        enabled=True,
    )
    assert await channel_ready.is_available() is True


@pytest.mark.asyncio
async def test_whatsapp_channel_send_missing_config(sample_alert: AlertMessage) -> None:
    channel = WhatsAppChannel(gateway_url="", default_recipient="")
    success = await channel.send(sample_alert)
    assert success is False


@pytest.mark.asyncio
async def test_whatsapp_channel_send_success(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = make_http_response(201, '{"status": "PENDING"}')

    channel = WhatsAppChannel(
        gateway_url="http://localhost:8085/message/sendText/infrawatch",
        api_token="SECURE_KEY",
        default_recipient="244923111222",
        client=mock_client,
    )

    success = await channel.send(sample_alert)

    assert success is True
    mock_client.post.assert_awaited_once()
    called_url = mock_client.post.call_args[0][0]
    called_payload = mock_client.post.call_args[1]["json"]
    called_headers = mock_client.post.call_args[1]["headers"]

    assert called_url == "http://localhost:8085/message/sendText/infrawatch"
    assert called_payload["number"] == "244923111222"
    assert "*[INFRAWATCH - CRITICAL]*" in called_payload["text"]
    assert called_headers["apikey"] == "SECURE_KEY"


@pytest.mark.asyncio
async def test_whatsapp_channel_send_recipient_override(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = make_http_response(200, "ok")

    channel = WhatsAppChannel(
        gateway_url="http://localhost:8085/message/sendText/infrawatch",
        default_recipient="244923111222",
        client=mock_client,
    )

    success = await channel.send(sample_alert, recipient="244999888777")
    assert success is True
    called_payload = mock_client.post.call_args[1]["json"]
    assert called_payload["number"] == "244999888777"


@pytest.mark.asyncio
async def test_whatsapp_channel_send_error(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.side_effect = httpx.HTTPError("Connection refused")

    channel = WhatsAppChannel(
        gateway_url="http://localhost:8085/message/sendText/infrawatch",
        default_recipient="244923111222",
        client=mock_client,
    )

    success = await channel.send(sample_alert)
    assert success is False


# ============================================================================
# SmtpNotificationChannel Tests
# ============================================================================


@pytest.mark.asyncio
async def test_smtp_channel_is_available() -> None:
    channel = SmtpNotificationChannel(smtp_host="")
    assert await channel.is_available() is False

    channel_ready = SmtpNotificationChannel(smtp_host="smtp.infrawatch.ao")
    assert await channel_ready.is_available() is True


@pytest.mark.asyncio
async def test_smtp_channel_send_missing_recipient(sample_alert: AlertMessage) -> None:
    channel = SmtpNotificationChannel(smtp_host="smtp.infrawatch.ao", default_recipient=None)
    success = await channel.send(sample_alert, recipient=None)
    assert success is False


@pytest.mark.asyncio
async def test_smtp_channel_send_success(sample_alert: AlertMessage) -> None:
    mock_sender = AsyncMock()
    channel = SmtpNotificationChannel(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_user="alerts@example.com",
        smtp_password="password",
        smtp_from="InfraWatch Alerts <alerts@example.com>",
        smtp_tls=True,
        default_recipient="noc@example.com",
        sender_func=mock_sender,
    )

    success = await channel.send(sample_alert)

    assert success is True
    mock_sender.assert_awaited_once()
    msg = mock_sender.call_args[0][0]
    kwargs = mock_sender.call_args[1]

    assert msg["Subject"] == "[INFRAWATCH - CRITICAL] Host Inacessível"
    assert msg["To"] == "noc@example.com"
    assert msg["From"] == "InfraWatch Alerts <alerts@example.com>"
    assert kwargs["hostname"] == "smtp.example.com"
    assert kwargs["port"] == 587
    assert kwargs["username"] == "alerts@example.com"
    assert kwargs["password"] == "password"
    assert kwargs["start_tls"] is True


@pytest.mark.asyncio
async def test_smtp_channel_send_failure(sample_alert: AlertMessage) -> None:
    mock_sender = AsyncMock(side_effect=Exception("SMTP Connection Error"))
    channel = SmtpNotificationChannel(
        smtp_host="smtp.example.com",
        default_recipient="noc@example.com",
        sender_func=mock_sender,
    )

    success = await channel.send(sample_alert)
    assert success is False


def test_smtp_channel_renders_html_template(sample_alert: AlertMessage) -> None:
    channel = SmtpNotificationChannel(smtp_host="smtp.example.com")
    html_content = channel._render_html(sample_alert)

    assert "InfraWatch - Alerta" in html_content
    assert "#DC2626" in html_content
    assert "CRITICAL" in html_content
    assert "Host Inacessível" in html_content
    assert "Switch-Core-01" in html_content
    assert "192.168.10.1" in html_content
    assert "15.5 minutos" in html_content


# ============================================================================
# WebhookChannel Tests
# ============================================================================


@pytest.mark.asyncio
async def test_webhook_channel_is_available() -> None:
    channel = WebhookChannel(webhook_url="")
    assert await channel.is_available() is False

    channel_ready = WebhookChannel(webhook_url="https://discord.com/api/webhooks/123/abc")
    assert await channel_ready.is_available() is True


def test_webhook_discord_payload(sample_alert: AlertMessage) -> None:
    channel = WebhookChannel()
    payload = channel.build_payload(sample_alert, "https://discord.com/api/webhooks/123/xyz")

    assert "embeds" in payload
    assert len(payload["embeds"]) == 1
    embed = payload["embeds"][0]
    assert embed["title"] == "[CRITICAL] Host Inacessível"
    assert embed["color"] == 0xDC2626
    field_names = [f["name"] for f in embed["fields"]]
    assert "Ativo" in field_names
    assert "Downtime" in field_names


def test_webhook_slack_payload(sample_alert: AlertMessage) -> None:
    channel = WebhookChannel()
    payload = channel.build_payload(sample_alert, "https://hooks.slack.com/services/T00/B00/X00")

    assert "blocks" in payload
    assert "text" in payload
    header_text = payload["blocks"][0]["text"]["text"]
    assert "[CRITICAL] Host Inacessível" in header_text


def test_webhook_generic_payload(sample_alert: AlertMessage) -> None:
    channel = WebhookChannel()
    payload = channel.build_payload(sample_alert, "https://api.empresa.ao/webhooks/alerts")

    assert payload["event"] == "alert.notification"
    assert payload["severity"] == "CRITICAL"
    assert payload["device_name"] == "Switch-Core-01"


@pytest.mark.asyncio
async def test_webhook_channel_send_success(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = make_http_response(204, "")

    channel = WebhookChannel(
        webhook_url="https://discord.com/api/webhooks/123/xyz",
        client=mock_client,
    )

    success = await channel.send(sample_alert)
    assert success is True
    mock_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_channel_send_error(sample_alert: AlertMessage) -> None:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = make_http_response(500, "Server Error")

    channel = WebhookChannel(
        webhook_url="https://discord.com/api/webhooks/123/xyz",
        client=mock_client,
    )

    success = await channel.send(sample_alert)
    assert success is False


# ============================================================================
# NotificationDispatcher Tests
# ============================================================================


@pytest.mark.asyncio
async def test_dispatcher_register_and_get() -> None:
    tg = TelegramChannel(bot_token="token", default_chat_id="chat")
    dispatcher = NotificationDispatcher(channels=[tg])

    assert "telegram" in dispatcher.registered_channels
    assert dispatcher.get_channel("telegram") is tg
    assert dispatcher.get_channel("unknown") is None


@pytest.mark.asyncio
async def test_dispatcher_routing_by_severity(sample_alert: AlertMessage) -> None:
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

    dispatcher = NotificationDispatcher(channels=[mock_tg, mock_wa, mock_wh, mock_smtp])

    # 1. CRITICAL deve despachar para todos os 4 canais
    result_critical = await dispatcher.dispatch_by_severity(sample_alert)
    assert result_critical == {
        "telegram": True,
        "whatsapp": True,
        "webhook": True,
        "smtp": True,
    }

    # 2. DEGRADED deve despachar para telegram, webhook, whatsapp
    degraded_alert = AlertMessage(
        title="Host Degradado",
        description="Perda de pacotes",
        severity=AlertSeverity.DEGRADED,
    )
    result_degraded = await dispatcher.dispatch_by_severity(degraded_alert)
    assert "smtp" not in result_degraded
    assert result_degraded["telegram"] is True
    assert result_degraded["webhook"] is True
    assert result_degraded["whatsapp"] is True

    # 3. INFO deve despachar para telegram e webhook
    info_alert = AlertMessage(
        title="Notificação",
        description="Info do sistema",
        severity=AlertSeverity.INFO,
    )
    result_info = await dispatcher.dispatch_by_severity(info_alert)
    assert result_info == {
        "telegram": True,
        "webhook": True,
    }


@pytest.mark.asyncio
async def test_dispatcher_handles_channel_failure_isolation(
    sample_alert: AlertMessage,
) -> None:
    """Garante que a falha ou exceção em um canal não impede outros canais de enviarem."""
    failing_tg = AsyncMock()
    failing_tg.name = "telegram"
    failing_tg.is_available.return_value = True
    failing_tg.send.side_effect = RuntimeError("Falha catastrófica de rede no Telegram")

    working_wh = AsyncMock()
    working_wh.name = "webhook"
    working_wh.is_available.return_value = True
    working_wh.send.return_value = True

    dispatcher = NotificationDispatcher(channels=[failing_tg, working_wh])

    result = await dispatcher.dispatch(sample_alert, channels=["telegram", "webhook"])

    assert result["telegram"] is False
    assert result["webhook"] is True


@pytest.mark.asyncio
async def test_dispatcher_skips_unavailable_channel(sample_alert: AlertMessage) -> None:
    unconfigured_ch = AsyncMock()
    unconfigured_ch.name = "whatsapp"
    unconfigured_ch.is_available.return_value = False

    dispatcher = NotificationDispatcher(channels=[unconfigured_ch])
    result = await dispatcher.dispatch(sample_alert, channels=["whatsapp"])

    assert result["whatsapp"] is False
    unconfigured_ch.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatcher_retries_transient_failure(sample_alert: AlertMessage) -> None:
    """Garante que falha transitória (False) na 1ª tentativa retenta e tem sucesso na 2ª."""
    flaky_ch = AsyncMock()
    flaky_ch.name = "webhook"
    flaky_ch.is_available.return_value = True
    flaky_ch.send.side_effect = [False, True]

    dispatcher = NotificationDispatcher(
        channels=[flaky_ch],
        max_retries=2,
        retry_delay_seconds=0.01,
        backoff_factor=1.0,
    )

    result = await dispatcher.dispatch(sample_alert, channels=["webhook"])

    assert result["webhook"] is True
    assert flaky_ch.send.await_count == 2


@pytest.mark.asyncio
async def test_dispatcher_exhausts_retries_on_persistent_failure(
    sample_alert: AlertMessage,
) -> None:
    """Garante que canal com falhas consecutivas esgota max_retries e retorna False."""
    failing_ch = AsyncMock()
    failing_ch.name = "telegram"
    failing_ch.is_available.return_value = True
    failing_ch.send.return_value = False

    dispatcher = NotificationDispatcher(
        channels=[failing_ch],
        max_retries=2,
        retry_delay_seconds=0.01,
        backoff_factor=1.0,
    )

    result = await dispatcher.dispatch(sample_alert, channels=["telegram"])

    assert result["telegram"] is False
    # 1 tentativa inicial + 2 retentativas = 3 chamadas
    assert failing_ch.send.await_count == 3


@pytest.mark.asyncio
async def test_dispatcher_retries_on_exception(sample_alert: AlertMessage) -> None:
    """Garante que exceção de rede na 1ª tentativa é retentada e tem sucesso na 2ª."""
    flaky_ch = AsyncMock()
    flaky_ch.name = "telegram"
    flaky_ch.is_available.return_value = True
    flaky_ch.send.side_effect = [RuntimeError("Timeout transitório"), True]

    dispatcher = NotificationDispatcher(
        channels=[flaky_ch],
        max_retries=2,
        retry_delay_seconds=0.01,
        backoff_factor=1.0,
    )

    result = await dispatcher.dispatch(sample_alert, channels=["telegram"])

    assert result["telegram"] is True
    assert flaky_ch.send.await_count == 2


def test_get_notification_dispatcher_singleton() -> None:
    dispatcher1 = get_notification_dispatcher()
    dispatcher2 = get_notification_dispatcher()

    assert dispatcher1 is dispatcher2
    registered = dispatcher1.registered_channels
    assert "telegram" in registered
    assert "whatsapp" in registered
    assert "webhook" in registered
    assert "smtp" in registered
