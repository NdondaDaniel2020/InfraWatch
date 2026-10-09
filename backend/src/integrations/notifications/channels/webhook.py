"""Canal de notificação para Webhooks (Discord, Slack e Generic HTTP endpoints)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.core.config import get_settings
from src.integrations.notifications.interfaces import AlertMessage, AlertSeverity

logger = logging.getLogger("infrawatch.notifications.webhook")

_DISCORD_COLORS: dict[AlertSeverity, int] = {
    AlertSeverity.CRITICAL: 0xDC2626,  # Vermelho
    AlertSeverity.DEGRADED: 0xF59E0B,  # Âmbar
    AlertSeverity.RESOLVED: 0x10B981,  # Verde
    AlertSeverity.INFO: 0x3B82F6,      # Azul
}


class WebhookChannel:
    """Implementação de canal via Webhook HTTP compatível com Discord, Slack e genéricos."""

    name: str = "webhook"

    def __init__(
        self,
        webhook_url: str | None = None,
        timeout_seconds: float = 10.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self.webhook_url = (
            webhook_url if webhook_url is not None else settings.DEFAULT_WEBHOOK_URL
        )
        self.timeout = timeout_seconds
        self._custom_client = client

    async def is_available(self) -> bool:
        """Verifica se uma URL de webhook padrão está configurada."""
        return bool(self.webhook_url and self.webhook_url.strip())

    def _build_discord_payload(self, alert: AlertMessage) -> dict[str, Any]:
        """Gera payload com Embed rico para webhooks do Discord."""
        color = _DISCORD_COLORS.get(alert.severity, 0x6B7280)
        fields: list[dict[str, Any]] = [
            {"name": "Severidade", "value": alert.severity.value, "inline": True},
        ]

        if alert.device_name:
            ip_str = f" ({alert.device_ip})" if alert.device_ip else ""
            fields.append({"name": "Ativo", "value": f"{alert.device_name}{ip_str}", "inline": True})

        if alert.downtime_minutes is not None and alert.downtime_minutes > 0:
            fields.append(
                {"name": "Downtime", "value": f"{alert.downtime_minutes:.1f} min", "inline": True}
            )

        embed = {
            "title": f"[{alert.severity.value}] {alert.title}",
            "description": alert.description,
            "color": color,
            "fields": fields,
            "timestamp": alert.timestamp.isoformat(),
            "footer": {"text": "InfraWatch Monitoring System"},
        }

        return {
            "username": "InfraWatch Alertas",
            "content": f"🚨 **Alerta de Infraestrutura:** {alert.title}"
            if alert.severity == AlertSeverity.CRITICAL
            else None,
            "embeds": [embed],
        }

    def _build_slack_payload(self, alert: AlertMessage) -> dict[str, Any]:
        """Gera payload formatado em blocos para webhooks do Slack."""
        blocks: list[dict[str, Any]] = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"[{alert.severity.value}] {alert.title}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{alert.description}*",
                },
            },
        ]

        fields: list[dict[str, str]] = []
        if alert.device_name:
            ip_str = f" ({alert.device_ip})" if alert.device_ip else ""
            fields.append({"type": "mrkdwn", "text": f"*Ativo:*\n{alert.device_name}{ip_str}"})

        if alert.downtime_minutes is not None and alert.downtime_minutes > 0:
            fields.append({"type": "mrkdwn", "text": f"*Downtime:*\n{alert.downtime_minutes:.1f} min"})

        fields.append({"type": "mrkdwn", "text": f"*Horário:*\n{alert.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}"})

        blocks.append({"type": "section", "fields": fields})

        return {
            "text": alert.format_summary(),
            "blocks": blocks,
        }

    def _build_generic_payload(self, alert: AlertMessage) -> dict[str, Any]:
        """Gera payload JSON estruturado para endpoints HTTP genéricos."""
        return {
            "event": "alert.notification",
            "severity": alert.severity.value,
            "title": alert.title,
            "description": alert.description,
            "device_id": str(alert.device_id) if alert.device_id else None,
            "device_name": alert.device_name,
            "device_ip": alert.device_ip,
            "downtime_minutes": alert.downtime_minutes,
            "timestamp": alert.timestamp.isoformat(),
            "summary": alert.format_summary(),
            "extra_data": alert.extra_data,
        }

    def build_payload(self, alert: AlertMessage, target_url: str) -> dict[str, Any]:
        """Roteia para o formato apropriado baseado na URL de destino."""
        url_lower = target_url.lower()
        if "discord.com/api/webhooks" in url_lower:
            return self._build_discord_payload(alert)
        if "hooks.slack.com" in url_lower:
            return self._build_slack_payload(alert)
        return self._build_generic_payload(alert)

    async def send(self, alert: AlertMessage, recipient: str | None = None) -> bool:
        """Envia o alerta para o webhook configurado ou recipient especificado."""
        target_url = recipient or self.webhook_url
        if not target_url:
            logger.debug("Webhook não configurado. Envio ignorado.")
            return False

        payload = self.build_payload(alert, target_url)

        try:
            if self._custom_client:
                response = await self._custom_client.post(
                    target_url,
                    json=payload,
                    timeout=self.timeout,
                )
            else:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(target_url, json=payload)

            if response.is_success:
                logger.info(
                    "Alerta '%s' enviado com sucesso via Webhook para %s (status %d)",
                    alert.title,
                    target_url,
                    response.status_code,
                )
                return True

            logger.error(
                "Falha ao enviar webhook (status %d): %s",
                response.status_code,
                response.text,
            )
            return False
        except Exception:
            logger.exception("Erro de comunicação com o endpoint de Webhook")
            return False
