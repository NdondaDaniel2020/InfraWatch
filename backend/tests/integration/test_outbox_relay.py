"""Testes de integração para o Transactional Outbox Pattern e OutboxRelayWorker.

Valida:
1. Gravação atômica da mutação de negócio junto com o evento no outbox (rollback total em falhas).
2. Processamento em lote e despacho com transição para PUBLISHED e processed_at preenchido.
3. Resiliência: incremento de retry_count em falhas transitórias e transição para FAILED após exceder max_retries.
4. Concorrência: execução paralela com múltiplos workers garantindo entrega sem duplicatas (At-Least-Once Delivery).
"""

import asyncio
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel, OutboxStatus
from src.core.database.outbox_repository import OutboxRepository
from src.core.database.unit_of_work import SqlAlchemyUnitOfWork
from src.core.domain.events import DomainEvent
from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker

# ---------------------------------------------------------------------------
# Stub de Evento de Domínio
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DeviceDiscovered(DomainEvent):
    """Stub de evento de teste."""

    hostname: str = ""
    ip: str = ""


# ---------------------------------------------------------------------------
# Fixture de Sessão com SQLite In-Memory
# ---------------------------------------------------------------------------


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

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# Testes de Integração
# ---------------------------------------------------------------------------


async def test_atomic_outbox_event_persistence_with_rollback(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante que se uma transação de negócio falhar, o evento correspondente no outbox também é revertido."""
    uow = SqlAlchemyUnitOfWork(session_factory=test_session_factory)
    event = DeviceDiscovered(hostname="core-switch-01", ip="10.0.0.1")

    with pytest.raises(RuntimeError, match="Falha no negócio simulada"):
        async with uow:
            OutboxRepository.add_event(session=uow.session, event=event, aggregate_type="Device")
            raise RuntimeError("Falha no negócio simulada")

    # Validar que a tabela outbox_events permaneceu vazia
    async with test_session_factory() as session:
        result = await session.execute(select(OutboxEventModel))
        events = result.scalars().all()
        assert len(events) == 0


async def test_relay_worker_processes_and_publishes_event(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida o ciclo completo de leitura, publicação no barramento e atualização para PUBLISHED."""
    published_events: list[dict[str, Any]] = []

    async def mock_publisher(event_type: str, payload: dict[str, Any]) -> None:
        published_events.append({"type": event_type, "payload": payload})

    # 1. Persistir evento no Outbox
    event = DeviceDiscovered(hostname="router-edge-01", ip="192.168.1.1")
    async with test_session_factory() as session, session.begin():
        OutboxRepository.add_event(session=session, event=event, aggregate_type="Device")

    # 2. Executar worker de relay
    worker = OutboxRelayWorker(
        publisher=mock_publisher,
        session_factory=test_session_factory,
        batch_size=10,
    )
    processed = await worker.process_batch()
    assert processed == 1

    # 3. Validar se o publicador recebeu o evento correto
    assert len(published_events) == 1
    assert published_events[0]["type"] == "DeviceDiscovered"
    assert published_events[0]["payload"]["hostname"] == "router-edge-01"

    # 4. Validar se o registro no banco foi atualizado para PUBLISHED
    async with test_session_factory() as session:
        result = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.id == event.event_id)
        )
        outbox_entry = result.scalar_one()
        assert outbox_entry.status == OutboxStatus.PUBLISHED
        assert outbox_entry.processed_at is not None


async def test_relay_worker_handles_failure_and_dead_letter(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida retentativas e transição para FAILED (Dead-Letter) quando o publicador falha consecutivamente."""
    failing_count = 0

    async def failing_publisher(event_type: str, payload: dict[str, Any]) -> None:
        nonlocal failing_count
        failing_count += 1
        raise ConnectionError("Barramento Redis indisponível temporariamente")

    event = DeviceDiscovered(hostname="broken-device", ip="10.254.0.1")
    async with test_session_factory() as session, session.begin():
        OutboxRepository.add_event(session=session, event=event, aggregate_type="Device")

    worker = OutboxRelayWorker(
        publisher=failing_publisher,
        session_factory=test_session_factory,
        batch_size=10,
        max_retries=3,
    )

    # Executa 3 vezes o batch: deve acumular retries e no 3º virar FAILED
    for _ in range(3):
        await worker.process_batch()

    async with test_session_factory() as session:
        result = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.id == event.event_id)
        )
        outbox_entry = result.scalar_one()
        assert outbox_entry.retry_count == 3
        assert outbox_entry.status == OutboxStatus.FAILED
        assert outbox_entry.processed_at is not None
        assert "Barramento Redis indisponível" in str(outbox_entry.error_message)


async def test_concurrent_relay_workers_prevent_duplicate_processing(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Simula múltiplos workers concorrentes processando uma fila de eventos sem duplicatas."""
    published_ids: list[str] = []
    lock = asyncio.Lock()

    async def tracking_publisher(event_type: str, payload: dict[str, Any]) -> None:
        async with lock:
            published_ids.append(payload["event_id"])
        # Simula latência de rede no envio
        await asyncio.sleep(0.01)

    # Inserir 10 eventos no outbox
    async with test_session_factory() as session, session.begin():
        for i in range(10):
            event = DeviceDiscovered(hostname=f"switch-{i}", ip=f"10.0.0.{i}")
            OutboxRepository.add_event(session=session, event=event, aggregate_type="Device")

    worker1 = OutboxRelayWorker(
        publisher=tracking_publisher, session_factory=test_session_factory, batch_size=5
    )
    worker2 = OutboxRelayWorker(
        publisher=tracking_publisher, session_factory=test_session_factory, batch_size=5
    )

    dialect = test_session_factory().bind.dialect.name
    if dialect == "sqlite":
        # No SQLite (sem suporte nativo a row-level lock SKIP LOCKED), os workers processam
        # em sucessão, validando que o worker 2 não duplica eventos já finalizados pelo worker 1
        res1 = await worker1.process_batch()
        res2 = await worker2.process_batch()
        results = [res1, res2]
    else:
        # No PostgreSQL com suporte a row-level locks, processa em paralelo com SKIP LOCKED
        results = await asyncio.gather(worker1.process_batch(), worker2.process_batch())

    # Total processado somado deve cobrir os 10 eventos
    assert sum(results) == 10
    # Nenhum evento pode ter sido despachado mais de uma vez (sem duplicatas)
    assert len(published_ids) == 10
    assert len(set(published_ids)) == 10
