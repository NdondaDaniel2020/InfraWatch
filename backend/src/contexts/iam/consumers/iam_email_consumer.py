"""Consumer assíncrono de e-mails transacionais do contexto IAM (ADR-020, ADR-022).

Escuta Domain Events publicados pelo Transactional Outbox no barramento
e delega o envio ao EmailService, desacoplando completamente a latência
de SMTP do tempo de resposta HTTP — eliminando a vulnerabilidade de
Timing Attack na enumeração de contas.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from src.contexts.iam.services.email_service import email_service
from src.core.messaging.idempotency import IdempotencyGuard, get_idempotency_guard
from src.core.messaging.resilient_bus import ResilientEventBus

logger = logging.getLogger("infrawatch.iam.consumer.email")

STREAM_TOPIC = "stream:iam:events"
IAM_EMAIL_CONSUMER_GROUP = "cg:iam_email_workers"

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

    def __init__(
        self,
        event_bus: ResilientEventBus | None = None,
        consumer_name: str = "iam-email-worker-1",
        batch_size: int = 10,
        poll_timeout_ms: int = 3000,
        idempotency_guard: IdempotencyGuard | None = None,
        max_retries: int = 5,
    ) -> None:
        self._event_bus = event_bus or ResilientEventBus()
        self.consumer_name = consumer_name
        self.batch_size = batch_size
        self.poll_timeout_ms = poll_timeout_ms
        self._idempotency_guard = idempotency_guard or get_idempotency_guard()
        self.max_retries = max_retries

    async def consume_loop(self, stop_event: asyncio.Event | None = None) -> None:
        """Loop contínuo de consumo de eventos de identidade via Redis Streams."""
        logger.info(
            "Iniciando IamEmailConsumer '%s' no stream '%s' (grupo '%s')",
            self.consumer_name,
            STREAM_TOPIC,
            IAM_EMAIL_CONSUMER_GROUP,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                messages = await self._event_bus.consume_batch(
                    topic=STREAM_TOPIC,
                    group=IAM_EMAIL_CONSUMER_GROUP,
                    consumer_name=self.consumer_name,
                    batch_size=self.batch_size,
                    timeout_ms=self.poll_timeout_ms,
                )

                if not messages:
                    continue

                acked_ids: list[str] = []
                for msg_id, payload in messages:
                    try:
                        event_type = str(payload.get("event_type", ""))
                        await self.handle(event_type, payload)
                        acked_ids.append(msg_id)
                    except Exception as exc:
                        delivery_count = await self._event_bus.get_delivery_count(
                            STREAM_TOPIC, IAM_EMAIL_CONSUMER_GROUP, msg_id
                        )
                        if delivery_count >= self.max_retries:
                            logger.error(
                                "E-mail %s atingiu limite de %d tentativas. Despachando para DLQ.",
                                msg_id,
                                self.max_retries,
                            )
                            await self._event_bus.send_to_dlq(
                                topic=STREAM_TOPIC,
                                group=IAM_EMAIL_CONSUMER_GROUP,
                                message_id=msg_id,
                                payload=payload,
                                error=str(exc),
                                delivery_count=delivery_count,
                            )
                        else:
                            logger.exception(
                                "Falha ao processar e-mail da mensagem %s (tentativa %d/%d) — retentará no próximo ciclo",
                                msg_id,
                                delivery_count,
                                self.max_retries,
                            )

                if acked_ids:
                    await self._event_bus.ack(STREAM_TOPIC, IAM_EMAIL_CONSUMER_GROUP, *acked_ids)

            except asyncio.CancelledError:
                logger.info(
                    "IamEmailConsumer '%s' interrompido graciosamente",
                    self.consumer_name,
                )
                break
            except Exception:
                logger.exception("Erro inesperado no loop do IamEmailConsumer")
                await asyncio.sleep(2.0)

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

        event_id = event_data.get("event_id") or event_data.get("id")
        if event_id and await self._idempotency_guard.is_processed(event_id, "IamEmailConsumer"):
            logger.warning(
                "Evento de IAM %s já processado pelo IamEmailConsumer (descarte idempotente)",
                event_id,
            )
            return

        try:
            await handler(event_data)
            if event_id:
                await self._idempotency_guard.mark_processed(event_id, "IamEmailConsumer")
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


__all__ = [
    "IAM_EMAIL_CONSUMER_GROUP",
    "IAM_EMAIL_TOPICS",
    "STREAM_TOPIC",
    "IamEmailConsumer",
]
