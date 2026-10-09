"""Canal de notificação para WhatsApp via Gateway REST (Evolution API / Baileys)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.core.config import get_settings
from src.integrations.notifications.interfaces import AlertMessage, AlertSeverity

logger = logging.getLogger("infrawatch.notifications.whatsapp")

_SEVERITY_EMOJI: dict[AlertSeverity, str] = {
    AlertSeverity.CRITICAL: "🚨",
    AlertSeverity.DEGRADED: "⚠️",
    AlertSeverity.RESOLVED: "✅",
    AlertSeverity.INFO: "ℹ️",
}


class WhatsAppChannel:
    """Implementação do canal de alertas via Gateway REST de WhatsApp (Evolution API)."""

    name: str = "whatsapp"

    def __init__(
        self,
        gateway_url: str | None = None,
        api_token: str | None = None,
        default_recipient: str | None = None,
        timeout_seconds: float = 10.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self.gateway_url = (
            gateway_url if gateway_url is not None else settings.WHATSAPP_GATEWAY_URL
        )
        self.api_token = api_token if api_token is not None else settings.WHATSAPP_API_TOKEN
        self.default_recipient = (
            default_recipient
            if default_recipient is not None
            else settings.WHATSAPP_DEFAULT_RECIPIENT
        )
        self.timeout = timeout_seconds
        self._custom_client = client

    async def is_available(self) -> bool:
        """Verifica se a URL do gateway e o token/destinatário estão configurados."""
        return bool(self.gateway_url and (self.api_token or self.default_recipient))

    def _format_message(self, alert: AlertMessage) -> str:
        """Formata a mensagem em texto plano com sintaxe Markdown do WhatsApp."""
        emoji = _SEVERITY_EMOJI.get(alert.severity, "🔔")
        lines = [
            f"{emoji} *[INFRAWATCH - {alert.severity.value}]*",
            f"*{alert.title}*",
            "",
            alert.description,
        ]

        if alert.device_name:
            ip_str = f" ({alert.device_ip})" if alert.device_ip else ""
            lines.append(f"📡 *Ativo:* {alert.device_name}{ip_str}")

        if alert.downtime_minutes is not None and alert.downtime_minutes > 0:
            lines.append(f"⏱️ *Downtime:* {alert.downtime_minutes:.1f} minutos")

        lines.append(f"🕒 *Horário:* {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        return "\n".join(lines)

    async def send(self, alert: AlertMessage, recipient: str | None = None) -> bool:
        """Envia mensagem para o número de WhatsApp especificado ou padrão."""
        target_number = recipient or self.default_recipient
        if not self.gateway_url or not target_number:
            logger.debug("WhatsApp não configurado (gateway_url ou destinatário ausente).")
            return False

        headers: dict[str, str] = {
            "Content-Type": "application/json",
        }
        if self.api_token:
            headers["apikey"] = self.api_token
            headers["Authorization"] = f"Bearer {self.api_token}"

        payload: dict[str, Any] = {
            "number": target_number,
            "text": self._format_message(alert),
        }

        try:
            if self._custom_client:
                response = await self._custom_client.post(
                    self.gateway_url,
                    json=payload,
                    headers=headers,
                    timeout=self.timeout,
                )
            else:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        self.gateway_url,
                        json=payload,
                        headers=headers,
                    )

            if response.is_success:
                logger.info(
                    "Alerta '%s' enviado com sucesso via WhatsApp para %s",
                    alert.title,
                    target_number,
                )
                return True

            logger.error(
                "Falha ao enviar alerta via WhatsApp (status %d): %s",
                response.status_code,
                response.text,
            )
            return False
        except Exception:
            logger.exception("Erro de comunicação com o gateway de WhatsApp")
            return False
