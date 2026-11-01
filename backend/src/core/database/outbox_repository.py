"""Repositório assíncrono para o Transactional Outbox (outbox_events).

Implementa operações atômicas de persistência, leitura com concorrência segura
(FOR UPDATE SKIP LOCKED) e atualização de status de entrega.
"""

import random
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select
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
        Filtra apenas eventos prontos para envio (next_retry_at nulo ou vencido).
        """
        now_utc = datetime.now(UTC)
        stmt = (
            select(OutboxEventModel)
            .where(OutboxEventModel.status == OutboxStatus.PENDING)
            .where(
                or_(
                    OutboxEventModel.next_retry_at.is_(None),
                    OutboxEventModel.next_retry_at <= now_utc,
                )
            )
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
    def calculate_backoff_delay(
        retry_count: int,
        base_delay: float = 10.0,
        max_delay: float = 300.0,
        jitter_pct: float = 0.2,
    ) -> float:
        """Calcula atraso exponencial com jitter simétrico: base * 2^(retry-1) ± jitter."""
        exponent = max(0, retry_count - 1)
        raw_delay = base_delay * (2 ** exponent)
        jitter_range = raw_delay * jitter_pct
        jitter = random.uniform(-jitter_range, jitter_range)
        delay = raw_delay + jitter
        return max(1.0, min(delay, max_delay))

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
            entry.next_retry_at = None

    @staticmethod
    async def mark_as_failed(
        session: AsyncSession,
        event_id: UUID,
        error: str,
        max_retries: int = 5,
        base_delay: float = 10.0,
        max_delay: float = 300.0,
    ) -> None:
        """Registra falha transitória ou permanente (Dead-Letter) com backoff exponencial e jitter."""
        stmt = select(OutboxEventModel).where(OutboxEventModel.id == event_id)
        result = await session.execute(stmt)
        entry = result.scalar_one_or_none()
        if entry is not None:
            entry.retry_count += 1
            entry.error_message = error
            if entry.retry_count >= max_retries:
                entry.status = OutboxStatus.FAILED
                entry.processed_at = datetime.now(UTC)
                entry.next_retry_at = None
            else:
                delay = OutboxRepository.calculate_backoff_delay(
                    retry_count=entry.retry_count,
                    base_delay=base_delay,
                    max_delay=max_delay,
                )
                entry.next_retry_at = datetime.now(UTC) + timedelta(seconds=delay)
