"""Canal de notificação para envio de e-mails via SMTP assíncrono (aiosmtplib)."""

from __future__ import annotations

import html
import logging
from collections.abc import Awaitable, Callable
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiosmtplib

from src.core.config import get_settings
from src.integrations.notifications.interfaces import AlertMessage, AlertSeverity

logger = logging.getLogger("infrawatch.notifications.smtp")

_SEVERITY_COLORS: dict[AlertSeverity, str] = {
    AlertSeverity.CRITICAL: "#DC2626",
    AlertSeverity.DEGRADED: "#D97706",
    AlertSeverity.RESOLVED: "#059669",
    AlertSeverity.INFO: "#2563EB",
}


class SmtpNotificationChannel:
    """Canal de envio de alertas via SMTP assíncrono."""

    name: str = "smtp"

    def __init__(
        self,
        smtp_host: str | None = None,
        smtp_port: int | None = None,
        smtp_user: str | None = None,
        smtp_password: str | None = None,
        smtp_from: str | None = None,
        smtp_tls: bool | None = None,
        default_recipient: str | None = None,
        timeout_seconds: float = 10.0,
        sender_func: Callable[..., Awaitable[Any]] | None = None,
    ) -> None:
        settings = get_settings()
        self.smtp_host = smtp_host if smtp_host is not None else settings.SMTP_HOST
        self.smtp_port = smtp_port if smtp_port is not None else settings.SMTP_PORT
        self.smtp_user = smtp_user if smtp_user is not None else settings.SMTP_USER
        self.smtp_password = (
            smtp_password if smtp_password is not None else settings.SMTP_PASSWORD
        )
        self.smtp_from = smtp_from if smtp_from is not None else settings.SMTP_FROM
        self.smtp_tls = smtp_tls if smtp_tls is not None else settings.SMTP_TLS
        self.default_recipient = default_recipient
        self.timeout = timeout_seconds
        self._sender_func = sender_func or aiosmtplib.send

    async def is_available(self) -> bool:
        """Verifica se o servidor SMTP está configurado."""
        return bool(self.smtp_host and self.smtp_host.strip())

    def _render_html(self, alert: AlertMessage) -> str:
        """Renderiza template HTML responsivo e seguro para o alerta."""
        color = _SEVERITY_COLORS.get(alert.severity, "#4B5563")
        safe_title = html.escape(alert.title)
        safe_desc = html.escape(alert.description)
        date_str = alert.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")

        device_section = ""
        if alert.device_name:
            ip_text = f" ({html.escape(alert.device_ip)})" if alert.device_ip else ""
            device_section = (
                f"<tr><td style='padding:6px 0;color:#6b7280;font-size:14px;width:120px;'><strong>Ativo:</strong></td>"
                f"<td style='padding:6px 0;color:#111827;font-size:14px;'>{html.escape(alert.device_name)}{ip_text}</td></tr>"
            )

        downtime_section = ""
        if alert.downtime_minutes is not None and alert.downtime_minutes > 0:
            downtime_section = (
                f"<tr><td style='padding:6px 0;color:#6b7280;font-size:14px;'><strong>Downtime:</strong></td>"
                f"<td style='padding:6px 0;color:#111827;font-size:14px;'>{alert.downtime_minutes:.1f} minutos</td></tr>"
            )

        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color:{color};padding:16px 24px;color:#ffffff;">
      <span style="display:inline-block;padding:2px 8px;background:rgba(255,255,255,0.25);border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">
        {alert.severity.value}
      </span>
      <h2 style="margin:8px 0 0 0;font-size:18px;font-weight:600;color:#ffffff;">{safe_title}</h2>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#374151;">{safe_desc}</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">
        {device_section}
        {downtime_section}
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;"><strong>Data/Hora:</strong></td>
            <td style="padding:6px 0;color:#111827;font-size:14px;">{date_str}</td></tr>
      </table>
    </div>
    <div style="background:#f9fafb;padding:12px 24px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px;">
      InfraWatch Monitoring System • Notificação Automática
    </div>
  </div>
</body>
</html>"""

    async def send(self, alert: AlertMessage, recipient: str | None = None) -> bool:
        """Envia e-mail formatado via SMTP assíncrono."""
        target_email = recipient or self.default_recipient
        if not target_email or not self.smtp_host:
            logger.debug("SMTP não configurado ou destinatário ausente. Envio ignorado.")
            return False

        message = MIMEMultipart("alternative")
        message["Subject"] = f"[INFRAWATCH - {alert.severity.value}] {alert.title}"
        message["From"] = self.smtp_from
        message["To"] = target_email

        # Versão texto simples
        text_part = MIMEText(alert.format_summary(), "plain", "utf-8")
        message.attach(text_part)

        # Versão HTML
        html_part = MIMEText(self._render_html(alert), "html", "utf-8")
        message.attach(html_part)

        try:
            await self._sender_func(
                message,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.smtp_user if self.smtp_user else None,
                password=self.smtp_password if self.smtp_password else None,
                start_tls=self.smtp_tls,
                timeout=self.timeout,
            )
            logger.info(
                "Alerta '%s' enviado com sucesso via SMTP para %s",
                alert.title,
                target_email,
            )
            return True
        except Exception:
            logger.exception("Falha ao despachar alerta via SMTP para %s", target_email)
            return False
