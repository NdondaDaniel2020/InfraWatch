"""Consumer assíncrono de e-mails transacionais do contexto IAM (ADR-020, ADR-022).

Escuta Domain Events publicados pelo Transactional Outbox no barramento
e delega o envio ao EmailService, desacoplando completamente a latência
de SMTP do tempo de resposta HTTP — eliminando a vulnerabilidade de
Timing Attack na enumeração de contas.
"""

from __future__ import annotations

import logging
from typing import Any

from src.contexts.iam.services.email_service import email_service

logger = logging.getLogger("infrawatch.iam.consumer.email")

# Mapeamento event_type -> handler method name
_EVENT_HANDLERS: dict[str, str] = {
    "PasswordResetRequestedEvent": "_handle_password_reset_requested",
    "PasswordChangedEvent": "_handle_password_changed",
    "PasswordResetCompletedEvent": "_handle_password_reset_completed",
    "EmailVerificationRequestedEvent": "_handle_email_verification_requested",
    "EmailVerifiedEvent": "_handle_email_verified",
    "AccountLockedEvent": "_handle_account_locked",
    "BackupCodeUsedEvent": "_handle_backup_code_used",
    "ProfileUpdatedEvent": "_handle_profile_updated",
    "RolesChangedEvent": "_handle_roles_changed",
    "AccountDeactivatedEvent": "_handle_account_deactivated",
}

IAM_EMAIL_TOPICS: set[str] = set(_EVENT_HANDLERS.keys())


class IamEmailConsumer:
    """Consumer que processa Domain Events de identidade e dispara e-mails transacionais.

    Projetado para rodar como subscriber assíncrono do EventBus (Redis Streams ou InMemory),
    dentro do processo principal da API ou como worker dedicado.
    """

    async def handle(self, topic: str, event_data: dict[str, Any]) -> None:
        """Despacha o evento recebido para o handler específico do tipo de e-mail."""
        event_type = event_data.get("event_type", topic)
        handler_name = _EVENT_HANDLERS.get(event_type)

        if handler_name is None:
            return

        handler = getattr(self, handler_name, None)
        if handler is None:
            logger.warning("Handler '%s' não encontrado para evento '%s'", handler_name, event_type)
            return

        try:
            await handler(event_data)
            logger.info("E-mail processado com sucesso para evento '%s'", event_type)
        except Exception:
            logger.exception("Falha ao processar e-mail para evento '%s'", event_type)
            raise

    # --- Handlers individuais ---

    @staticmethod
    async def _handle_password_reset_requested(data: dict[str, Any]) -> None:
        await email_service.send_password_reset_email(
            to_email=data["email"],
            reset_token=data["reset_token"],
        )

    @staticmethod
    async def _handle_password_changed(data: dict[str, Any]) -> None:
        await email_service.send_password_changed_email(to_email=data["email"])

    @staticmethod
    async def _handle_password_reset_completed(data: dict[str, Any]) -> None:
        await email_service.send_password_reset_completed_email(to_email=data["email"])

    @staticmethod
    async def _handle_email_verification_requested(data: dict[str, Any]) -> None:
        await email_service.send_verification_email(
            to_email=data["email"],
            verify_token=data["verify_token"],
        )

    @staticmethod
    async def _handle_email_verified(data: dict[str, Any]) -> None:
        await email_service.send_welcome_email(
            to_email=data["email"],
            full_name=data.get("full_name", ""),
        )

    @staticmethod
    async def _handle_account_locked(data: dict[str, Any]) -> None:
        await email_service.send_account_locked_email(
            to_email=data["email"],
            block_minutes=int(data.get("block_minutes", 15)),
        )

    @staticmethod
    async def _handle_backup_code_used(data: dict[str, Any]) -> None:
        await email_service.send_backup_code_used_email(
            to_email=data["email"],
            remaining_count=int(data.get("remaining_count", 0)),
        )

    @staticmethod
    async def _handle_profile_updated(data: dict[str, Any]) -> None:
        await email_service.send_profile_updated_email(
            to_email=data["email"],
            changed_fields=data.get("changed_fields", ""),
        )

    @staticmethod
    async def _handle_roles_changed(data: dict[str, Any]) -> None:
        await email_service.send_roles_changed_email(
            to_email=data["email"],
            new_roles=data.get("new_roles", ""),
        )

    @staticmethod
    async def _handle_account_deactivated(data: dict[str, Any]) -> None:
        await email_service.send_account_deactivated_email(
            to_email=data["email"],
            reason=data.get("reason", "Suspensão administrativa por conformidade de segurança"),
        )
