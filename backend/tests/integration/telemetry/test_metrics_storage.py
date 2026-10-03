"""Testes de integração do armazenamento de séries temporais de telemetria.

Valida inserção em lote via MetricsBatchWriter e lógica do buffer
usando SQLite in-memory (sem particionamento — feature exclusiva PostgreSQL).
"""

from collections.abc import AsyncGenerator
from datetime import datetime, UTC
from uuid import uuid4

import pytest
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.telemetry.services.batch_writer import MetricsBatchWriter
from src.workers.probers.base import ProbeResult


@pytest.fixture
async def metrics_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria banco SQLite in-memory com tabela metrics simplificada (sem particionamento)."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Cria tabela simplificada — SQLite não suporta PARTITION BY RANGE
    # nem BIGSERIAL em PK composta. Usamos INTEGER PRIMARY KEY AUTOINCREMENT simples.
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE metrics (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id   TEXT            NOT NULL,
                organization_id TEXT        NOT NULL,
                metric_type VARCHAR(50)     NOT NULL,
                value       REAL            NOT NULL,
                packet_loss REAL            NOT NULL DEFAULT 0.0,
                status      VARCHAR(20)     NOT NULL DEFAULT 'UP',
                timestamp   DATETIME        NOT NULL DEFAULT (datetime('now'))
            );
        """))
        await conn.execute(text("CREATE INDEX ix_metrics_device_ts ON metrics (device_id, timestamp);"))

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    await engine.dispose()


@pytest.mark.asyncio
async def test_batch_writer_inserts_metrics_in_bulk(
    metrics_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que o batch writer insere 1000 registros em lote com sucesso."""
    writer = MetricsBatchWriter(
        session_factory=metrics_session_factory,
        batch_size=2000,  # Não dispara auto-flush por volume
        flush_interval_seconds=60.0,
    )

    org_id = uuid4()

    # Enfileira 500 ProbeResults (cada um gera ~2 métricas = ~1000 registros)
    for i in range(500):
        result = ProbeResult(
            device_id=uuid4(),
            target_name=f"device-{i}",
            status="UP",
            latency_ms=float(i % 100),
            packet_loss_pct=0.0,
        )
        writer.enqueue(result, organization_id=org_id)

    assert writer.pending_count == 1000  # 500 * 2 métricas (latency + packet_loss)

    # Flush manual
    inserted = await writer.flush()
    assert inserted == 1000
    assert writer.pending_count == 0

    # Verifica no banco
    async with metrics_session_factory() as session:
        row = (await session.execute(text("SELECT COUNT(*) FROM metrics"))).scalar()
        assert row == 1000


@pytest.mark.asyncio
async def test_batch_writer_requeues_on_failure(
    metrics_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que métricas são re-enfileiradas se a inserção falhar."""
    writer = MetricsBatchWriter(
        session_factory=metrics_session_factory,
        batch_size=5000,
    )

    org_id = uuid4()
    result = ProbeResult(
        device_id=uuid4(),
        target_name="test",
        status="UP",
        latency_ms=10.0,
        packet_loss_pct=0.0,
    )
    writer.enqueue(result, organization_id=org_id)

    assert writer.pending_count == 2

    # Simula falha dropando a tabela antes do flush
    async with metrics_session_factory() as session, session.begin():
        await session.execute(text("DROP TABLE IF EXISTS metrics"))

    inserted = await writer.flush()
    assert inserted == 0
    # Dados devem ter sido re-enfileirados
    assert writer.pending_count == 2


@pytest.mark.asyncio
async def test_batch_writer_extra_data_generates_additional_metrics(
    metrics_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida que extra_data (status_code, tls_days_left) gera métricas adicionais."""
    writer = MetricsBatchWriter(
        session_factory=metrics_session_factory,
        batch_size=5000,
    )

    org_id = uuid4()
    result = ProbeResult(
        device_id=uuid4(),
        target_name="https-server",
        status="UP",
        latency_ms=45.0,
        packet_loss_pct=0.0,
        extra_data={"status_code": 200, "tls_days_left": 90},
    )
    writer.enqueue(result, organization_id=org_id)

    # latency_ms + packet_loss + status_code + tls_days_left = 4
    assert writer.pending_count == 4

    inserted = await writer.flush()
    assert inserted == 4

    # Verifica tipos de métrica no banco
    async with metrics_session_factory() as session:
        rows = (await session.execute(text("SELECT DISTINCT metric_type FROM metrics"))).scalars().all()
        assert set(rows) == {"latency_ms", "packet_loss", "status_code", "tls_days_left"}


@pytest.mark.asyncio
async def test_metric_query_by_device_and_timerange(
    metrics_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida consultas por device_id e intervalo de tempo (simula Partition Pruning)."""
    writer = MetricsBatchWriter(
        session_factory=metrics_session_factory,
        batch_size=5000,
    )

    device_a = uuid4()
    device_b = uuid4()
    org_id = uuid4()

    # Device A: 10 medições
    for _ in range(10):
        writer.enqueue(
            ProbeResult(device_id=device_a, target_name="A", status="UP", latency_ms=5.0, packet_loss_pct=0.0),
            organization_id=org_id,
        )

    # Device B: 5 medições
    for _ in range(5):
        writer.enqueue(
            ProbeResult(device_id=device_b, target_name="B", status="DOWN", latency_ms=0.0, packet_loss_pct=100.0),
            organization_id=org_id,
        )

    await writer.flush()

    # Consulta apenas device A
    async with metrics_session_factory() as session:
        count_a = (await session.execute(
            text("SELECT COUNT(*) FROM metrics WHERE device_id = :did"),
            {"did": str(device_a)},
        )).scalar()
        count_b = (await session.execute(
            text("SELECT COUNT(*) FROM metrics WHERE device_id = :did"),
            {"did": str(device_b)},
        )).scalar()
        assert count_a == 20  # 10 * 2 (latency + loss)
        assert count_b == 10  # 5 * 2
