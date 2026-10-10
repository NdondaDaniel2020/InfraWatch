"""Canal de notificação para envio de e-mails via SMTP assíncrono (aiosmtplib)."""

from __future__ import annotations

import html
import logging
from collections.abc import Awaitable, Callable
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import lru_cache
from pathlib import Path
from string import Template
from typing import Any

import aiosmtplib

from src.core.config import get_settings
from src.integrations.notifications.interfaces import AlertMessage, AlertSeverity

logger = logging.getLogger("infrawatch.notifications.smtp")

_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"

_SEVERITY_COLORS: dict[AlertSeverity, str] = {
    AlertSeverity.CRITICAL: "#DC2626",
    AlertSeverity.DEGRADED: "#D97706",
    AlertSeverity.RESOLVED: "#059669",
    AlertSeverity.INFO: "#2563EB",
}


@lru_cache(maxsize=8)
def _load_template(template_name: str) -> Template:
    """Carrega e armazena em cache o template de e-mail a partir do disco."""
    template_path = _TEMPLATES_DIR / template_name
    if template_path.is_file():
        return Template(template_path.read_text(encoding="utf-8"))
    logger.warning("Template '%s' não encontrado em '%s'", template_name, template_path)
    return Template("<div><h2>$title</h2><p>$description</p></div>")


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
        self.default_recipient = (
            default_recipient
            if default_recipient is not None
            else (settings.SMTP_DEFAULT_RECIPIENT or None)
        )
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

        template = _load_template("alert_email.html")
        return template.safe_substitute(
            color=color,
            severity=alert.severity.value,
            title=safe_title,
            description=safe_desc,
            device_section=device_section,
            downtime_section=downtime_section,
            timestamp=date_str,
        )

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
