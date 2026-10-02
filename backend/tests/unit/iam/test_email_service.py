"""Testes unitários e de integração para EmailService e templates de e-mail."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.contexts.iam.services.email_service import (
    EmailService,
    render_template,
    sanitize_context_value,
)


def test_sanitize_context_value() -> None:
    """Verifica se a sanitização de valores HTML previne XSS e injeção de tags."""
    # Teste com strings maliciosas
    malicious_script = "<script>alert('xss')</script>"
    sanitized = sanitize_context_value(malicious_script)
    assert "<script>" not in sanitized
    assert "&lt;script&gt;" in sanitized

    # Teste com valores None
    assert sanitize_context_value(None) == ""

    # Teste com tipos numéricos e booleanos
    assert sanitize_context_value(42) == 42
    assert sanitize_context_value(True) is True

    # Teste com listas recursivas
    raw_list = ["<b>bold</b>", 123]
    sanitized_list = sanitize_context_value(raw_list)
    assert sanitized_list == ["&lt;b&gt;bold&lt;/b&gt;", 123]

    # Teste com dicionários recursivos
    raw_dict = {"title": "<h1>Title</h1>", "count": 5}
    sanitized_dict = sanitize_context_value(raw_dict)
    assert sanitized_dict == {"title": "&lt;h1&gt;Title&lt;/h1&gt;", "count": 5}


def test_render_template_existing() -> None:
    """Valida a renderização de templates existentes com interpolação de variáveis."""
    html_out = render_template(
        "account_created.html",
        verify_link="https://app.infrawatch.io/verify?token=abc123xyz",
    )
    assert "https://app.infrawatch.io/verify?token=abc123xyz" in html_out
    assert "Confirmação de E-mail" in html_out
    assert "InfraWatch" in html_out


def test_render_template_escapes_xss() -> None:
    """Valida se o render_template escapa dados maliciosos passados no contexto."""
    html_out = render_template(
        "welcome.html",
        full_name="<script>evil()</script>",
        dashboard_url="https://app.infrawatch.io/dashboard",
    )
    assert "<script>evil()</script>" not in html_out
    assert "&lt;script&gt;evil()&lt;/script&gt;" in html_out
    assert "https://app.infrawatch.io/dashboard" in html_out


def test_render_template_fallback_on_missing() -> None:
    """Valida se um template inexistente gera fallback HTML seguro sem quebrar."""
    fallback_html = render_template("non_existent_template.html", custom_key="safe_val")
    assert "Notificação InfraWatch:" in fallback_html
    assert "custom_key" in fallback_html
    assert "safe_val" in fallback_html


@pytest.mark.asyncio
async def test_email_service_fallback_log_when_smtp_not_configured() -> None:
    """Garante que EmailService não quebra quando SMTP_HOST não está definido (modo log)."""
    service = EmailService()
    service.settings.SMTP_HOST = ""

    with patch("src.contexts.iam.services.email_service.logger.info") as mock_info:
        await service.send_email(
            to_email="dev@example.com",
            subject="Teste",
            html_content="<p>Conteúdo</p>",
        )
        assert mock_info.called
        log_msg = mock_info.call_args[0][0]
        assert "SMTP não configurado" in log_msg


@pytest.mark.asyncio
async def test_email_service_send_smtp_success() -> None:
    """Valida o envio SMTP chamando a thread de transporte quando configurado."""
    service = EmailService()
    service.settings.SMTP_HOST = "smtp.infrawatch.io"
    service.settings.SMTP_PORT = 587
    service.settings.SMTP_USER = "noreply@infrawatch.io"
    service.settings.SMTP_PASSWORD = "secretpassword"
    service.settings.SMTP_TLS = True
    service.settings.SMTP_FROM = "InfraWatch <noreply@infrawatch.io>"

    with patch("src.contexts.iam.services.email_service._send_smtp_sync") as mock_sync:
        await service.send_email(
            to_email="client@example.com",
            subject="Bem-vindo",
            html_content="<p>Olá</p>",
        )
        mock_sync.assert_called_once_with(
            host="smtp.infrawatch.io",
            port=587,
            user="noreply@infrawatch.io",
            password="secretpassword",
            use_tls=True,
            sender="InfraWatch <noreply@infrawatch.io>",
            to_email="client@example.com",
            subject="Bem-vindo",
            html_content="<p>Olá</p>",
        )


@pytest.mark.asyncio
async def test_email_service_handles_smtp_error_gracefully() -> None:
    """Verifica se falhas de conexão SMTP são tratadas com log sem propagar exceção."""
    service = EmailService()
    service.settings.SMTP_HOST = "smtp.infrawatch.io"

    with (
        patch(
            "src.contexts.iam.services.email_service._send_smtp_sync",
            side_effect=Exception("Connection timed out"),
        ),
        patch("src.contexts.iam.services.email_service.logger.error") as mock_error,
    ):
        # Não deve lançar exceção
        await service.send_email(
            to_email="fail@example.com",
            subject="Teste",
            html_content="<p>Falha</p>",
        )
        assert mock_error.called
        assert "Falha ao enviar e-mail" in mock_error.call_args[0][0]


@pytest.mark.asyncio
async def test_semantic_email_methods() -> None:
    """Valida todos os métodos utilitários de notificação da camada de identidade."""
    service = EmailService()
    service.send_email = AsyncMock()  # type: ignore[method-assign]

    # 1. Verificação de e-mail
    await service.send_verification_email("user@example.com", "token123")
    assert service.send_email.call_count == 1
    args = service.send_email.call_args[0]
    assert args[0] == "user@example.com"
    assert "Confirme seu e-mail" in args[1]
    assert "token123" in args[2]

    # 2. Redefinição de senha
    await service.send_password_reset_email("user@example.com", "reset456")
    assert service.send_email.call_count == 2
    args = service.send_email.call_args[0]
    assert "Redefinição de senha" in args[1]
    assert "reset456" in args[2]

    # 3. Senha alterada
    await service.send_password_changed_email("user@example.com")
    assert service.send_email.call_count == 3
    args = service.send_email.call_args[0]
    assert "Sua senha foi alterada" in args[1]

    # 4. Conta bloqueada
    await service.send_account_locked_email("user@example.com", block_minutes=15)
    assert service.send_email.call_count == 4
    args = service.send_email.call_args[0]
    assert "Conta bloqueada temporariamente" in args[1]
    assert "15 minutos" in args[2]

    # 5. Código de recuperação utilizado
    await service.send_backup_code_used_email("user@example.com", remaining_count=8)
    assert service.send_email.call_count == 5
    args = service.send_email.call_args[0]
    assert "Código de recuperação utilizado" in args[1]
    assert "8" in args[2]

    # 6. Boas-vindas
    await service.send_welcome_email("user@example.com", full_name="João Silva")
    assert service.send_email.call_count == 6
    args = service.send_email.call_args[0]
    assert "Bem-vindo ao InfraWatch!" in args[1]
    assert "João Silva" in args[2]

    # 7. Conta desativada
    await service.send_account_deactivated_email("user@example.com", reason="Violação de termos")
    assert service.send_email.call_count == 7
    args = service.send_email.call_args[0]
    assert "conta no InfraWatch foi desativada" in args[1]
    assert "Violação de termos" in args[2]

    # 8. Senha redefinida com sucesso
    await service.send_password_reset_completed_email("user@example.com")
    assert service.send_email.call_count == 8
    args = service.send_email.call_args[0]
    assert "redefinida com sucesso" in args[1]
    assert "login" in args[2]

    # 9. Perfil atualizado
    await service.send_profile_updated_email(
        "user@example.com", changed_fields=["Nome", "Telefone"]
    )
    assert service.send_email.call_count == 9
    args = service.send_email.call_args[0]
    assert "Perfil atualizado" in args[1]
    assert "Nome, Telefone" in args[2]

    # 10. Papéis alterados
    await service.send_roles_changed_email("user@example.com", new_roles=["ORG_ADMIN"])
    assert service.send_email.call_count == 10
    args = service.send_email.call_args[0]
    assert "Alteração de Privilégios" in args[1]
    assert "ORG_ADMIN" in args[2]
    assert "Privilégios da Conta Atualizados" in args[2]


def test_render_new_templates_content_and_escaping() -> None:
    """Verifica renderização e escape de todos os 4 novos templates de e-mail."""
    # Deactivated
    deact_html = render_template("deactivated.html", reason="<script>bad()</script>Inatividade")
    assert "Conta Desativada" in deact_html
    assert "<script>bad()</script>" not in deact_html
    assert "&lt;script&gt;bad()&lt;/script&gt;Inatividade" in deact_html

    # Password Reset Completed
    pwd_done_html = render_template(
        "password_reset_completed.html",
        login_url="https://app.infrawatch.io/login",
    )
    assert "Senha Redefinida com Sucesso!" in pwd_done_html
    assert "https://app.infrawatch.io/login" in pwd_done_html

    # Profile Updated
    profile_html = render_template(
        "profile_updated.html",
        changed_fields="Nome Completo, E-mail",
    )
    assert "Atualização de Perfil Realizada" in profile_html
    assert "Nome Completo, E-mail" in profile_html

    # Roles Changed
    roles_html = render_template(
        "roles_changed.html",
        new_roles="ORG_ADMIN, AUDITOR",
    )
    assert "Privilégios da Conta Atualizados" in roles_html
    assert "ORG_ADMIN, AUDITOR" in roles_html
