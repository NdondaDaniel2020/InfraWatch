"""Canal de notificação para Telegram Bot API (ADR-023)."""

from __future__ import annotations

import html
import logging
from typing import Any

import httpx

from src.core.config import get_settings
from src.integrations.notifications.interfaces import AlertMessage, AlertSeverity

logger = logging.getLogger("infrawatch.notifications.telegram")

_SEVERITY_EMOJI: dict[AlertSeverity, str] = {
    AlertSeverity.CRITICAL: "🚨",
    AlertSeverity.DEGRADED: "⚠️",
    AlertSeverity.RESOLVED: "✅",
    AlertSeverity.INFO: "ℹ️",
}


class TelegramChannel:
    """Implementação do canal de alertas via Telegram Bot API."""

    name: str = "telegram"

    def __init__(
        self,
        bot_token: str | None = None,
        default_chat_id: str | None = None,
        timeout_seconds: float = 10.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self.bot_token = bot_token if bot_token is not None else settings.TELEGRAM_BOT_TOKEN
        self.default_chat_id = (
            default_chat_id if default_chat_id is not None else settings.TELEGRAM_DEFAULT_CHAT_ID
        )
        self.timeout = timeout_seconds
        self._custom_client = client

    async def is_available(self) -> bool:
        """Verifica se o bot token e o chat id estão configurados."""
        return bool(self.bot_token and (self.default_chat_id or self.bot_token.strip()))

    def _format_message(self, alert: AlertMessage) -> str:
        """Formata o alerta em HTML para renderização no Telegram."""
        emoji = _SEVERITY_EMOJI.get(alert.severity, "🔔")
        title = html.escape(alert.title)
        desc = html.escape(alert.description)

        lines = [
            f"{emoji} <b>[{alert.severity.value}] {title}</b>",
            "",
            desc,
        ]

        if alert.device_name:
            ip_str = f" (<code>{html.escape(alert.device_ip)}</code>)" if alert.device_ip else ""
            lines.append(f"<b>Ativo:</b> {html.escape(alert.device_name)}{ip_str}")

        if alert.downtime_minutes is not None and alert.downtime_minutes > 0:
            lines.append(f"<b>Downtime:</b> {alert.downtime_minutes:.1f} minutos")

        lines.append(f"<b>Data/Hora:</b> {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        return "\n".join(lines)

    async def send(self, alert: AlertMessage, recipient: str | None = None) -> bool:
        """Envia mensagem formatada para o chat do Telegram."""
        chat_id = recipient or self.default_chat_id
        if not self.bot_token or not chat_id:
            logger.debug("Telegram não configurado (token ou chat_id ausente). Envio ignorado.")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": self._format_message(alert),
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        try:
            if self._custom_client:
                response = await self._custom_client.post(url, json=payload, timeout=self.timeout)
            else:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(url, json=payload)

            if response.is_success:
                logger.info("Alerta '%s' enviado com sucesso via Telegram para %s", alert.title, chat_id)
                return True

            logger.error(
                "Falha ao enviar alerta via Telegram (status %d): %s",
                response.status_code,
                response.text,
            )
            return False
        except Exception:
            logger.exception("Erro de comunicação com a API do Telegram")
            return False
