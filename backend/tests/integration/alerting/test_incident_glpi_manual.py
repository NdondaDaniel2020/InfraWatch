"""Testes de integração para abertura manual de chamado no GLPI (RF-INC-02)."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
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


async def seed_data(session: AsyncSession):
    org = OrganizationModel(id=uuid4(), name="Org Teste", slug="org-teste")
    session.add(org)

    user = UserModel(
        id=uuid4(),
        organization_id=org.id,
        email="noc@infrawatch.io",
        password_hash="hash",
        full_name="Operador NOC",
        role=UserRole.NOC_OPERATOR.value,
        is_active=True,
    )
    session.add(user)

    device = DeviceModel(
        id=uuid4(),
        organization_id=org.id,
        name="Router Borda",
        ip_address="192.168.1.1",
        port=80,
        protocol="http",
        category="ROUTER",
        status="DOWN",
    )
    session.add(device)

    incident = IncidentModel(
        id=uuid4(),
        device_id=device.id,
        organization_id=org.id,
        title="Roteador inalcançável via ICMP",
        severity="CRITICAL",
        status="TRIGGERED",
        glpi_ticket_id=None,
    )
    session.add(incident)
    await session.commit()
    return org, user, device, incident


@pytest.mark.asyncio
async def test_create_glpi_ticket_success(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, device, incident = await seed_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.open_ticket.return_value = 888

    with patch(
        "src.contexts.alerting.services.incident_service.IncidentService.create_glpi_ticket"
    ) as mock_service_call:
        from src.contexts.alerting.domain.incident import Incident

        domain_inc = Incident(
            id=incident.id,
            device_id=device.id,
            organization_id=org.id,
            title=incident.title,
            glpi_ticket_id=888,
        )
        mock_service_call.return_value = domain_inc

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/incidents/{incident.id}/glpi-ticket",
                headers=headers,
            )

        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["id"] == str(incident.id)
        assert data["glpi_ticket_id"] == 888


@pytest.mark.asyncio
async def test_create_glpi_ticket_already_exists_conflict(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, _device, incident = await seed_data(session)
        incident.glpi_ticket_id = 1234
        await session.commit()

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/incidents/{incident.id}/glpi-ticket",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_409_CONFLICT
    assert "já possui chamado GLPI" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_glpi_ticket_incident_not_found(override_get_db, test_session_factory):
    async with test_session_factory() as session:
        org, user, _, _ = await seed_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}
    fake_id = uuid4()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/incidents/{fake_id}/glpi-ticket",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_create_glpi_ticket_disabled_service_unavailable(
    override_get_db, test_session_factory
):
    async with test_session_factory() as session:
        org, user, _, incident = await seed_data(session)

    token = generate_token(user.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Força GLPI_ENABLED=False nas settings
    mock_settings = MagicMock()
    mock_settings.GLPI_ENABLED = False
    mock_settings.GLPI_BASE_URL = ""

    with patch(
        "src.core.config.get_settings",
        return_value=mock_settings,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/incidents/{incident.id}/glpi-ticket",
                headers=headers,
            )

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "não está habilitada" in resp.json()["detail"]
