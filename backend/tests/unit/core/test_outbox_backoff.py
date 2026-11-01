"""Testes unitários para o cálculo de exponential backoff com jitter e filtragem no outbox."""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel, OutboxStatus
from src.core.database.outbox_repository import OutboxRepository


@pytest.fixture
async def test_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria engine SQLite in-memory com tabelas registradas no Base.metadata."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    yield session_maker

    await engine.dispose()


def test_calculate_backoff_delay_exponential_growth_and_jitter() -> None:
    """Valida progressão exponencial e limites de jitter em calculate_backoff_delay."""
    # 1ª tentativa: base * 2^0 = 10s ± 20% -> [8.0, 12.0]
    for _ in range(50):
        delay_1 = OutboxRepository.calculate_backoff_delay(
            retry_count=1, base_delay=10.0, max_delay=300.0, jitter_pct=0.2
        )
        assert 8.0 <= delay_1 <= 12.0

    # 2ª tentativa: base * 2^1 = 20s ± 20% -> [16.0, 24.0]
    for _ in range(50):
        delay_2 = OutboxRepository.calculate_backoff_delay(
            retry_count=2, base_delay=10.0, max_delay=300.0, jitter_pct=0.2
        )
        assert 16.0 <= delay_2 <= 24.0

    # 3ª tentativa: base * 2^2 = 40s ± 20% -> [32.0, 48.0]
    for _ in range(50):
        delay_3 = OutboxRepository.calculate_backoff_delay(
            retry_count=3, base_delay=10.0, max_delay=300.0, jitter_pct=0.2
        )
        assert 32.0 <= delay_3 <= 48.0

    # Limite máximo de teto (max_delay = 300.0)
    for _ in range(50):
        delay_max = OutboxRepository.calculate_backoff_delay(
            retry_count=10, base_delay=10.0, max_delay=300.0, jitter_pct=0.2
        )
        assert delay_max <= 300.0
        assert delay_max >= 1.0


@pytest.mark.asyncio
async def test_mark_as_failed_schedules_next_retry_at(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que mark_as_failed agenda next_retry_at com backoff se retry_count < max_retries."""
    async with test_session_factory() as session:
        event = OutboxEventModel(
            id=uuid4(),
            event_type="TestEvent",
            aggregate_type="Device",
            payload={"key": "val"},
            status=OutboxStatus.PENDING,
            retry_count=0,
            created_at=datetime.now(UTC),
        )
        session.add(event)
        await session.commit()

        # Falha 1 (retry_count passa a 1 < max_retries 3)
        before = datetime.now(UTC)
        await OutboxRepository.mark_as_failed(
            session=session,
            event_id=event.id,
            error="Erro temporário de conexão",
            max_retries=3,
            base_delay=10.0,
            max_delay=60.0,
        )
        await session.commit()
        await session.refresh(event)

        assert event.status == OutboxStatus.PENDING
        assert event.retry_count == 1
        assert event.error_message == "Erro temporário de conexão"
        assert event.next_retry_at is not None
        retry_at = event.next_retry_at
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=UTC)
        # delay para retry_count=1 está entre 8 e 12 segundos
        assert retry_at >= before + timedelta(seconds=7.5)
        assert retry_at <= before + timedelta(seconds=13.0)


@pytest.mark.asyncio
async def test_mark_as_failed_transitions_to_failed_on_max_retries(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida transição para FAILED e remoção de next_retry_at ao atingir max_retries."""
    async with test_session_factory() as session:
        event = OutboxEventModel(
            id=uuid4(),
            event_type="TestEvent",
            aggregate_type="Device",
            payload={"key": "val"},
            status=OutboxStatus.PENDING,
            retry_count=2,
            next_retry_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        session.add(event)
        await session.commit()

        # 3ª falha atinge max_retries=3
        await OutboxRepository.mark_as_failed(
            session=session,
            event_id=event.id,
            error="Erro fatal",
            max_retries=3,
        )
        await session.commit()
        await session.refresh(event)

        assert event.status == OutboxStatus.FAILED
        assert event.retry_count == 3
        assert event.next_retry_at is None
        assert event.processed_at is not None


@pytest.mark.asyncio
async def test_mark_as_published_clears_next_retry_at(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que mark_as_published limpa next_retry_at e preenche processed_at."""
    async with test_session_factory() as session:
        event = OutboxEventModel(
            id=uuid4(),
            event_type="TestEvent",
            aggregate_type="Device",
            payload={"key": "val"},
            status=OutboxStatus.PENDING,
            next_retry_at=datetime.now(UTC) + timedelta(seconds=30),
            created_at=datetime.now(UTC),
        )
        session.add(event)
        await session.commit()

        await OutboxRepository.mark_as_published(session, event.id)
        await session.commit()
        await session.refresh(event)

        assert event.status == OutboxStatus.PUBLISHED
        assert event.next_retry_at is None
        assert event.processed_at is not None


@pytest.mark.asyncio
async def test_fetch_pending_events_filters_by_next_retry_at(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que fetch_pending_events ignora eventos com next_retry_at futuro."""
    now = datetime.now(UTC)
    async with test_session_factory() as session:
        # Evento 1: Novo, sem next_retry_at (deve vir)
        e1 = OutboxEventModel(
            id=uuid4(),
            event_type="Event1",
            aggregate_type="Device",
            payload={},
            status=OutboxStatus.PENDING,
            next_retry_at=None,
            created_at=now - timedelta(minutes=5),
        )
        # Evento 2: Em backoff futuro (NÃO deve vir)
        e2 = OutboxEventModel(
            id=uuid4(),
            event_type="Event2",
            aggregate_type="Device",
            payload={},
            status=OutboxStatus.PENDING,
            next_retry_at=now + timedelta(seconds=60),
            created_at=now - timedelta(minutes=4),
        )
        # Evento 3: Backoff já vencido no passado (deve vir)
        e3 = OutboxEventModel(
            id=uuid4(),
            event_type="Event3",
            aggregate_type="Device",
            payload={},
            status=OutboxStatus.PENDING,
            next_retry_at=now - timedelta(seconds=5),
            created_at=now - timedelta(minutes=3),
        )
        # Evento 4: Já publicado (NÃO deve vir)
        e4 = OutboxEventModel(
            id=uuid4(),
            event_type="Event4",
            aggregate_type="Device",
            payload={},
            status=OutboxStatus.PUBLISHED,
            next_retry_at=None,
            created_at=now - timedelta(minutes=2),
        )
        session.add_all([e1, e2, e3, e4])
        await session.commit()

        pending = await OutboxRepository.fetch_pending_events(session, limit=10)
        pending_ids = [e.id for e in pending]

        assert e1.id in pending_ids
        assert e3.id in pending_ids
        assert e2.id not in pending_ids
        assert e4.id not in pending_ids
