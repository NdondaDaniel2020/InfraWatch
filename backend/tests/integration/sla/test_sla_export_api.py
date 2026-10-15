"""Testes de integração para exportação de relatórios de SLA em CSV e JSON (RF-SLA-02)."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import status
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.iam.database.models import OrganizationModel, UserModel
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.inventory.database.models import DeviceModel
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


def generate_token(user_id: UUID, role: UserRole, org_id: UUID | None = None) -> str:
    """Gera um token JWT com claims padrão para testes."""
    return str(
        create_access_token(
            user_id=user_id,
            role=role.value,
            org_id=org_id,
            extra_claims={"email": f"{role.value.lower()}@infrawatch.io"},
        )
    )


async def seed_sla_data(session: AsyncSession):
    org = OrganizationModel(id=uuid4(), name="Empresa SLA", slug="empresa-sla")
    session.add(org)

    user = UserModel(
        id=uuid4(),
        organization_id=org.id,
        email="noc@infrawatch.io",
        password_hash="hash",
        full_name="Operador SLA",
        role=UserRole.NOC_OPERATOR.value,
        is_active=True,
    )
    session.add(user)

    device = DeviceModel(
        id=uuid4(),
        organization_id=org.id,
        name="Switch Core",
        ip_address="10.0.0.1",
        port=80,
        protocol="http",
        category="SWITCH",
        status="UP",
    )
    session.add(device)

    # Cria incidente com 2 horas de downtime
    now = datetime.now(UTC)
    incident = IncidentModel(
        id=uuid4(),
        device_id=device.id,
        organization_id=org.id,
        title="Queda de link",
        severity="CRITICAL",
        status="RESOLVED",
        started_at=now - timedelta(days=2),
        resolved_at=now - timedelta(days=2) + timedelta(hours=2),
        downtime_minutes=120,
        root_cause="Fibra rompida",
    )
    session.add(incident)
    await session.commit()
    return org, user, device, incident


@pytest.mark.asyncio
async def test_export_device_sla_csv_success(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, device, _ = await seed_sla_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/api/v1/sla/devices/{device.id}/export?format=csv",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_200_OK
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]
    content = resp.text
    assert "Device ID" in content
    assert "Switch Core" in content
    assert "Uptime (%)" in content


@pytest.mark.asyncio
async def test_export_device_sla_json_success(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, device, _ = await seed_sla_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/api/v1/sla/devices/{device.id}/export?format=json",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_200_OK
    assert "application/json" in resp.headers["content-type"]
    data = resp.json()
    assert data["device_id"] == str(device.id)
    assert "uptime_percentage" in data


@pytest.mark.asyncio
async def test_export_organization_sla_csv_success(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, _device, _ = await seed_sla_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/api/v1/sla/organizations/{org.id}/export",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_200_OK
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]
    content = resp.text
    assert "Device ID" in content
    assert "Switch Core" in content


@pytest.mark.asyncio
async def test_export_device_sla_device_not_found(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, _, _ = await seed_sla_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}
    fake_id = uuid4()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/api/v1/sla/devices/{fake_id}/export?format=csv",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_export_organization_sla_forbidden_for_other_tenant(
    override_get_db, test_session_factory
):
    async with test_session_factory() as session:
        org, user, _, _ = await seed_sla_data(session)

    other_org_id = uuid4()
    # Cria token de viewer restrito a org
    token = generate_token(user.id, UserRole.CLIENT_VIEWER, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            f"/api/v1/sla/organizations/{other_org_id}/export",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_403_FORBIDDEN
