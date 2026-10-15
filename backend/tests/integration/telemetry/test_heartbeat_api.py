"""Testes de integração para recepção de Heartbeat Passivo (RF-MON-01)."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from typing import Any
from uuid import uuid4

import httpx
import pytest
from fastapi import status
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.database.models import OrganizationModel
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
from src.main import app


@pytest.fixture
async def test_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria engine SQLite em memória isolada para testes."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def receive_connect(dbapi_connection: Any, connection_record: Any) -> None:
        dbapi_connection.create_function(
            "to_tsvector", 2, lambda lang, text: text, deterministic=True
        )

    from sqlalchemy import text

    def _create_tables(sync_conn: Any) -> None:
        target_tables = [
            t for t in Base.metadata.sorted_tables if t.name in ("organizations", "devices")
        ]
        Base.metadata.create_all(sync_conn, tables=target_tables)

    def _drop_tables(sync_conn: Any) -> None:
        target_tables = [
            t for t in Base.metadata.sorted_tables if t.name in ("organizations", "devices")
        ]
        Base.metadata.drop_all(sync_conn, tables=target_tables)

    async with engine.begin() as conn:
        await conn.run_sync(_create_tables)
        await conn.execute(
            text("""
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
        """)
        )
        await conn.execute(
            text("CREATE INDEX ix_metrics_device_ts ON metrics (device_id, timestamp);")
        )

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    async with engine.begin() as conn:
        await conn.run_sync(_drop_tables)
        await conn.execute(text("DROP TABLE IF EXISTS metrics;"))
    await engine.dispose()


@pytest.fixture
def override_get_db(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> Generator[None, None, None]:
    """Sobrescreve a dependência de sessão do banco para os testes."""

    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = _get_test_session
    yield
    app.dependency_overrides.clear()


async def seed_device(session: AsyncSession) -> tuple[OrganizationModel, DeviceModel]:
    org = OrganizationModel(id=uuid4(), name="Org Batch", slug="org-batch")
    session.add(org)

    device = DeviceModel(
        id=uuid4(),
        organization_id=org.id,
        name="Backup Daily Cronjob",
        ip_address="10.0.2.15",
        port=0,
        protocol="http",
        category="SERVER",
        status="UNKNOWN",
    )
    session.add(device)
    await session.commit()
    return org, device


@pytest.mark.asyncio
async def test_receive_heartbeat_success(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        _, device = await seed_device(session)

    payload = {
        "duration_ms": 1250.5,
        "status": "UP",
        "message": "Rotina de backup concluída com sucesso.",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/monitoring/heartbeat/{device.id}",
            json=payload,
        )

    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["status"] == "UP"
    assert data["device_id"] == str(device.id)
    assert "concluída com sucesso" in data["message"]

    # Verifica persistência da métrica e atualização do status do dispositivo
    async with test_session_factory() as session:
        dev_res = await session.execute(select(DeviceModel).where(DeviceModel.id == device.id))
        updated_dev = dev_res.scalar_one()
        assert updated_dev.status == "UP"

        metric_res = await session.execute(
            select(MetricModel).where(MetricModel.device_id == device.id)
        )
        metric = metric_res.scalar_one()
        assert metric.metric_type == "heartbeat"
        assert metric.value == 1250.5
        assert metric.status == "UP"


@pytest.mark.asyncio
async def test_receive_heartbeat_device_not_found(override_get_db, test_session_factory):
    fake_id = uuid4()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/monitoring/heartbeat/{fake_id}",
            json={"status": "UP"},
        )

    assert resp.status_code == status.HTTP_404_NOT_FOUND
    assert "não encontrado" in resp.json()["detail"]
