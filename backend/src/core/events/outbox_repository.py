"""Repositório assíncrono para o Transactional Outbox (outbox_events).

Implementa operações atômicas de persistência, leitura com concorrência segura
(FOR UPDATE SKIP LOCKED) e atualização de status de entrega.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database.models.outbox import OutboxEventModel, OutboxStatus
from src.core.domain.events import DomainEvent


class OutboxRepository:
    """Repositório assíncrono para manipulação de eventos na tabela outbox_events."""

    @staticmethod
    def add_event(
        session: AsyncSession,
        event: DomainEvent,
        aggregate_type: str = "",
    ) -> OutboxEventModel:
        """Converte um DomainEvent em OutboxEventModel e adiciona à sessão da transação ativa."""
        event_dict = event.to_dict()
        outbox_entry = OutboxEventModel(
            id=event.event_id,
            event_type=event.event_type,
            aggregate_type=aggregate_type,
            aggregate_id=event.aggregate_id,
            payload=event_dict,
            status=OutboxStatus.PENDING,
            created_at=event.occurred_at,
        )
        session.add(outbox_entry)
        return outbox_entry

    @staticmethod
    async def fetch_pending_events(
        session: AsyncSession,
        limit: int = 50,
    ) -> Sequence[OutboxEventModel]:
        """Consulta os eventos pendentes mais antigos com bloqueio seguro (FOR UPDATE SKIP LOCKED).

        Em PostgreSQL, utiliza 'FOR UPDATE SKIP LOCKED' para evitar contenção e duplo processamento
        entre múltiplos workers concorrentes. Em SQLite, executa query ordenada direta.
        """
        stmt = (
            select(OutboxEventModel)
            .where(OutboxEventModel.status == OutboxStatus.PENDING)
            .order_by(OutboxEventModel.created_at.asc())
            .limit(limit)
        )

        # Se a conexão for PostgreSQL, aplica bloqueio não-bloqueante SKIP LOCKED
        bind = session.bind
        dialect_name = bind.dialect.name if bind is not None else ""
        if dialect_name != "sqlite":
            stmt = stmt.with_for_update(skip_locked=True)

        result = await session.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def mark_as_published(
        session: AsyncSession,
        event_id: UUID,
    ) -> None:
        """Marca o evento como publicado com sucesso com timestamp UTC de processamento."""
        stmt = select(OutboxEventModel).where(OutboxEventModel.id == event_id)
        result = await session.execute(stmt)
        entry = result.scalar_one_or_none()
        if entry is not None:
            entry.status = OutboxStatus.PUBLISHED
            entry.processed_at = datetime.now(UTC)

    @staticmethod
    async def mark_as_failed(
        session: AsyncSession,
        event_id: UUID,
        error: str,
        max_retries: int = 5,
    ) -> None:
        """Registra falha transitória ou permanente (Dead-Letter) com incremento de retry_count."""
        stmt = select(OutboxEventModel).where(OutboxEventModel.id == event_id)
        result = await session.execute(stmt)
        entry = result.scalar_one_or_none()
        if entry is not None:
            entry.retry_count += 1
            entry.error_message = error
            if entry.retry_count >= max_retries:
                entry.status = OutboxStatus.FAILED
                entry.processed_at = datetime.now(UTC)
