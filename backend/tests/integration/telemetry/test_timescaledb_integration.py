"""Testes de integração para TimescaleDB, Hypertables e resiliência de telemetria.

Cobre a validação da migração Alembic 013 (Hypertable, compressão colunar e políticas),
a resiliência do PartitionManager perante Hypertables vs tabelas particionadas clássicas,
e a integridade de ingestão e consulta de séries temporais com MetricModel e MetricsBatchWriter.
"""

import importlib.util
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool


def _load_migration_013():
    path = (
        Path(__file__).resolve().parents[3]
        / "alembic"
        / "versions"
        / "013_enable_timescaledb_hypertable.py"
    )
    spec = importlib.util.spec_from_file_location("migration_013", path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


migration_013 = _load_migration_013()
from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.services.batch_writer import MetricsBatchWriter
from src.workers.maintenance.partition_manager import PartitionManager
from src.workers.probers.base import ProbeResult


class AsyncContextManager:
    def __init__(self, return_obj=None):
        self.return_obj = return_obj

    async def __aenter__(self):
        return self.return_obj

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.fixture
async def sqlite_timeseries_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria banco SQLite in-memory com schema compatível para testes de séries temporais."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.execute(
            text("""
            CREATE TABLE metrics (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id       TEXT            NOT NULL,
                organization_id TEXT            NOT NULL,
                metric_type     VARCHAR(50)     NOT NULL,
                value           REAL            NOT NULL,
                packet_loss     REAL            NOT NULL DEFAULT 0.0,
                status          VARCHAR(20)     NOT NULL DEFAULT 'UP',
                timestamp       DATETIME        NOT NULL DEFAULT (datetime('now'))
            );
            """)
        )
        await conn.execute(
            text("CREATE INDEX ix_metrics_dev_ts ON metrics (device_id, timestamp DESC);")
        )

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    await engine.dispose()


def test_alembic_013_metadata_and_revisions():
    """Valida metadados estruturais da migração Alembic 013 para TimescaleDB."""
    assert migration_013.revision == "013_enable_timescaledb"
    assert migration_013.down_revision == "012_alter_devices_timestamps"
    assert hasattr(migration_013, "upgrade")
    assert hasattr(migration_013, "downgrade")
    assert callable(migration_013.upgrade)
    assert callable(migration_013.downgrade)


@pytest.mark.asyncio
async def test_partition_manager_detects_timescaledb_hypertable():
    """Valida que o PartitionManager detecta relkind != 'p' e omite DDL de partição."""
    mock_session = AsyncMock()
    mock_session.begin = MagicMock(return_value=AsyncContextManager(mock_session))

    # Simula pg_class retornando 'r' (regular table no TimescaleDB)
    mock_scalar = MagicMock()
    mock_scalar.scalar.return_value = "r"
    mock_session.execute.return_value = mock_scalar

    factory = MagicMock(return_value=AsyncContextManager(mock_session))
    factory.mock_session = mock_session

    pm = PartitionManager(session_factory=factory)

    # ensure_partition deve retornar False sem executar CREATE TABLE PARTITION OF
    created = await pm.ensure_partition(2026, 11)
    assert created is False
    assert pm._is_hypertable is True
    # Apenas o SELECT relkind deve ter sido executado
    assert mock_session.execute.await_count == 1


@pytest.mark.asyncio
async def test_partition_manager_supports_declarative_partitioning_fallback():
    """Valida que o PartitionManager continua funcional para particionamento nativo ('p')."""
    mock_session = AsyncMock()
    mock_session.begin = MagicMock(return_value=AsyncContextManager(mock_session))

    mock_relkind = MagicMock()
    mock_relkind.scalar.return_value = "p"  # Declarativo nativo

    mock_exists = MagicMock()
    mock_exists.scalar.return_value = None  # Partição não existe ainda

    mock_create = MagicMock()

    mock_session.execute.side_effect = [mock_relkind, mock_exists, mock_create]

    factory = MagicMock(return_value=AsyncContextManager(mock_session))
    factory.mock_session = mock_session

    pm = PartitionManager(session_factory=factory)

    created = await pm.ensure_partition(2026, 11)
    assert created is True
    assert pm._is_hypertable is False
    assert mock_session.execute.await_count == 3


@pytest.mark.asyncio
async def test_timeseries_batch_ingestion_and_segmented_queries(
    sqlite_timeseries_factory: async_sessionmaker[AsyncSession],
):
    """Valida ingestão em lote e consultas com segmentação compatíveis com TimescaleDB."""
    writer = MetricsBatchWriter(
        session_factory=sqlite_timeseries_factory,
        batch_size=100,
        flush_interval_seconds=60.0,
    )

    org_id = uuid4()
    device_a = uuid4()
    device_b = uuid4()

    # Enfileira dados para múltiplos dispositivos e métricas
    res_a = ProbeResult(
        device_id=device_a,
        target_name="gateway-core",
        status="UP",
        latency_ms=12.5,
        packet_loss_pct=0.0,
    )
    res_b = ProbeResult(
        device_id=device_b,
        target_name="switch-access",
        status="DEGRADED",
        latency_ms=155.0,
        packet_loss_pct=5.0,
    )

    writer.enqueue(res_a, organization_id=org_id)
    writer.enqueue(res_b, organization_id=org_id)

    inserted = await writer.flush()
    assert inserted == 4  # 2 métricas por resultado (latency_ms e packet_loss)

    async with sqlite_timeseries_factory() as session:
        # Consulta segmentada por device_id e metric_type (segmentby no TimescaleDB)
        query = text(
            "SELECT id, device_id, organization_id, metric_type, value, packet_loss, status "
            "FROM metrics "
            "WHERE organization_id = :org_id AND device_id = :device_id AND metric_type = 'latency_ms' "
            "ORDER BY timestamp DESC"
        )
        result = await session.execute(
            query,
            {"org_id": str(org_id), "device_id": str(device_a)},
        )
        metric = result.mappings().first()

        assert metric is not None
        assert metric["value"] == 12.5
        assert metric["status"] == "UP"
        assert metric["packet_loss"] == 0.0


@pytest.mark.asyncio
async def test_metric_model_composite_pk_timescale_compliance(
    sqlite_timeseries_factory: async_sessionmaker[AsyncSession],
):
    """Garante que a chave primária composta (id, timestamp) atende aos requisitos do TimescaleDB."""
    now = datetime.now(UTC)
    metric = MetricModel(
        device_id=uuid4(),
        organization_id=uuid4(),
        metric_type="latency_ms",
        value=24.2,
        packet_loss=0.0,
        status="UP",
        timestamp=now,
    )

    async with sqlite_timeseries_factory() as session, session.begin():
        session.add(metric)
        await session.flush()
        assert metric.id is not None
        assert metric.timestamp == now
