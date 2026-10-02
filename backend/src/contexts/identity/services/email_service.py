"""Serviço de renderização e envio de e-mails transacionais de identidade."""

from __future__ import annotations

import asyncio
import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from string import Template
from typing import Any

from src.core.config import get_settings

logger = logging.getLogger("infrawatch.identity.email")

_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates" / "emails"


def sanitize_context_value(val: Any) -> Any:
    """Sanitiza recursivamente valores do contexto para prevenir injeção HTML e XSS."""
    if val is None:
        return ""
    if isinstance(val, str):
        return html.escape(val, quote=True)
    if isinstance(val, list):
        return [sanitize_context_value(x) for x in val]
    if isinstance(val, dict):
        return {k: sanitize_context_value(v) for k, v in val.items()}
    if isinstance(val, (int, float, bool)):
        return val
    return html.escape(str(val), quote=True)


def render_template(name: str, **context: Any) -> str:
    """Renderiza um template HTML com interpolação segura de variáveis."""
    if not name.endswith(".html"):
        name = f"{name}.html"
    template_path = _TEMPLATES_DIR / name

    sanitized_context = {k: sanitize_context_value(v) for k, v in context.items()}

    if not template_path.is_file():
        logger.warning("Template de e-mail '%s' não encontrado em '%s'", name, template_path)
        items = "".join(
            f"<li><strong>{html.escape(str(k))}:</strong> {v}</li>"
            for k, v in sanitized_context.items()
        )
        return f"<div><p>Notificação InfraWatch:</p><ul>{items}</ul></div>"

    template = Template(template_path.read_text(encoding="utf-8"))
    return template.safe_substitute(**sanitized_context)


def _send_smtp_sync(
    host: str,
    port: int,
    user: str | None,
    password: str | None,
    use_tls: bool,
    sender: str,
    to_email: str,
    subject: str,
    html_content: str,
) -> None:
    """Função síncrona que efetua o envio via smtplib em thread separada."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email

    part = MIMEText(html_content, "html", "utf-8")
    msg.attach(part)

    with smtplib.SMTP(host, port, timeout=10) as server:
        if use_tls:
            server.starttls()
        if user and password:
            server.login(user, password)
        server.sendmail(sender, [to_email], msg.as_string())


class EmailService:
    """Gerenciador assíncrono de comunicação transacional por e-mail."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
    ) -> None:
        """Envia e-mail via SMTP com fallback resiliente para logging em desenvolvimento."""
        if not self.settings.SMTP_HOST:
            logger.info(
                "SMTP não configurado — simulando envio de e-mail para %s\nAssunto: %s\nConteúdo:\n%s",
                to_email,
                subject,
                html_content,
            )
            return

        try:
            await asyncio.to_thread(
                _send_smtp_sync,
                host=self.settings.SMTP_HOST,
                port=self.settings.SMTP_PORT,
                user=self.settings.SMTP_USER,
                password=self.settings.SMTP_PASSWORD,
                use_tls=self.settings.SMTP_TLS,
                sender=self.settings.SMTP_FROM,
                to_email=to_email,
                subject=subject,
                html_content=html_content,
            )
            logger.info("E-mail enviado com sucesso para %s | Assunto: %s", to_email, subject)
        except Exception as exc:  # noqa: BLE001
            logger.error("Falha ao enviar e-mail para %s via SMTP: %s", to_email, exc)

    async def send_verification_email(self, to_email: str, verify_token: str) -> None:
        """Envia link de ativação e verificação de e-mail da conta."""
        verify_link = f"{self.settings.FRONTEND_URL}/verify-email?token={verify_token}"
        subject = "Confirme seu e-mail — InfraWatch"
        html_content = render_template("account_created.html", verify_link=verify_link)
        await self.send_email(to_email, subject, html_content)

    async def send_password_reset_email(self, to_email: str, reset_token: str) -> None:
        """Envia link seguro de redefinição de senha."""
        reset_link = f"{self.settings.FRONTEND_URL}/reset-password?token={reset_token}"
        subject = "Redefinição de senha — InfraWatch"
        html_content = render_template("password_reset.html", reset_link=reset_link)
        await self.send_email(to_email, subject, html_content)

    async def send_password_changed_email(self, to_email: str) -> None:
        """Notifica o usuário sobre alteração de senha recente."""
        subject = "Sua senha foi alterada — InfraWatch"
        html_content = render_template("password_changed.html")
        await self.send_email(to_email, subject, html_content)

    async def send_account_locked_email(self, to_email: str, block_minutes: int) -> None:
        """Alerta sobre bloqueio temporário devido a falhas consecutivas de login."""
        subject = "Alerta de Segurança: Conta bloqueada temporariamente — InfraWatch"
        html_content = render_template("account_locked.html", block_minutes=block_minutes)
        await self.send_email(to_email, subject, html_content)

    async def send_backup_code_used_email(self, to_email: str, remaining_count: int) -> None:
        """Alerta sobre uso de código de recuperação de dois fatores."""
        subject = "Alerta de Segurança: Código de recuperação utilizado — InfraWatch"
        html_content = render_template("backup_code_used.html", remaining_count=remaining_count)
        await self.send_email(to_email, subject, html_content)

    async def send_welcome_email(self, to_email: str, full_name: str) -> None:
        """Envia mensagem de boas-vindas após confirmação de conta."""
        dashboard_url = f"{self.settings.FRONTEND_URL}/dashboard"
        subject = "Bem-vindo ao InfraWatch!"
        html_content = render_template(
            "welcome.html",
            full_name=full_name,
            dashboard_url=dashboard_url,
        )
        await self.send_email(to_email, subject, html_content)

    async def send_account_deactivated_email(
        self,
        to_email: str,
        reason: str = "Suspensão administrativa por conformidade de segurança",
    ) -> None:
        """Alerta o usuário sobre desativação de conta por um administrador."""
        subject = "Aviso de Segurança: Sua conta no InfraWatch foi desativada"
        html_content = render_template("deactivated.html", reason=reason)
        await self.send_email(to_email, subject, html_content)

    async def send_password_reset_completed_email(self, to_email: str) -> None:
        """Confirmação de que a redefinição de senha foi concluída com sucesso."""
        login_url = f"{self.settings.FRONTEND_URL}/login"
        subject = "Sua senha foi redefinida com sucesso — InfraWatch"
        html_content = render_template(
            "password_reset_completed.html",
            login_url=login_url,
        )
        await self.send_email(to_email, subject, html_content)

    async def send_profile_updated_email(
        self,
        to_email: str,
        changed_fields: list[str] | str,
    ) -> None:
        """Notifica o usuário sobre alterações cadastrais realizadas no perfil."""
        fields_str = (
            ", ".join(changed_fields)
            if isinstance(changed_fields, list)
            else str(changed_fields)
        )
        subject = "Alerta de Segurança: Perfil atualizado — InfraWatch"
        html_content = render_template(
            "profile_updated.html",
            changed_fields=fields_str,
        )
        await self.send_email(to_email, subject, html_content)

    async def send_roles_changed_email(
        self,
        to_email: str,
        new_roles: list[str] | str,
    ) -> None:
        """Notifica o usuário sobre alteração de privilégios ou papéis de acesso."""
        roles_str = (
            ", ".join(new_roles)
            if isinstance(new_roles, list)
            else str(new_roles)
        )
        subject = "Alteração de Privilégios da Conta — InfraWatch"
        html_content = render_template("roles_changed.html", new_roles=roles_str)
        await self.send_email(to_email, subject, html_content)


# Instância singleton padrão do serviço
email_service = EmailService()
