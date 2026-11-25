"""Testes de integração para abertura de chamados no GLPI via Portal do Cliente.

Valida:
1. Abertura com sucesso via API REST do GLPI (com mock do GlpiClient).
2. Retorno do ticket_id real gerado pelo GLPI e protocolo InfraWatch.
3. Sanitização contra Stored XSS nos campos de título e descrição.
4. Isolamento multitenant anti-IDOR bloqueando abertura referenciando device_id de outra organização.
5. Bloqueio 403 Forbidden para requisições com organização não autorizada no token.
6. Tratamento gracioso de erro quando o GLPI falha (retornando 503).
"""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import status
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.database.models import OrganizationModel
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.sla.api.dependencies.services import get_glpi_client
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
from src.integrations.glpi.client import GlpiAuthError
from src.main import app


@pytest.fixture
async def test_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    from sqlalchemy import event

    @event.listens_for(engine.sync_engine, "connect")
    def receive_connect(dbapi_connection, connection_record):
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
def override_get_db(test_session_factory: async_sessionmaker[AsyncSession]):
    async def _get_test_session():
        async with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = _get_test_session
    yield
    app.dependency_overrides.clear()


def generate_token(role: str, org_id: str | None = None) -> str:
    user_id = str(uuid4())
    res = create_access_token(
        user_id=user_id,
        role=role,
        org_id=org_id,
        extra_claims={"email": f"{role.lower()}@infrawatch.ao"},
    )
    return str(res)


@pytest.mark.asyncio
async def test_create_support_ticket_success_with_glpi(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida abertura de chamado com sucesso retornando ticket_id real do GLPI."""
    org_id = uuid4()
    dev_id = uuid4()
    now = datetime.now(UTC)

    async with test_session_factory() as session:
        org = OrganizationModel(
            id=org_id,
            name="Empresa Alpha Telecom",
            slug="alpha-telecom",
            created_at=now,
        )
        session.add(org)

        dev = DeviceModel(
            id=dev_id,
            organization_id=org_id,
            name="Core Router BGP",
            ip_address="192.168.1.1",
            port=0,
            protocol="ICMP",
            category="ROUTER",
            status="UP",
            interval_seconds=30,
            is_paused=False,
            created_at=now,
        )
        session.add(dev)
        await session.commit()

    mock_glpi = AsyncMock()
    mock_glpi.__aenter__.return_value = mock_glpi
    mock_glpi.open_ticket.return_value = 4502

    app.dependency_overrides[get_glpi_client] = lambda: mock_glpi

    token = generate_token("CLIENT_VIEWER", str(org_id))
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "title": "Lentidão intermitente no link principal",
        "description": "Notamos alta latência nos últimos 30 minutos na rota BGP.",
        "severity": "HIGH",
        "device_id": str(dev_id),
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/sla/organizations/{org_id}/support-ticket",
            json=payload,
            headers=headers,
        )

    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["status"] == "OPEN"
    assert data["glpi_ticket_id"] == 4502
    assert data["protocol"].startswith("INFRA-")
    assert "4502" in data["message"]

    # Verifica se o GlpiClient foi acionado com os dados corretos
    mock_glpi.open_ticket.assert_awaited_once()
    called_payload = mock_glpi.open_ticket.call_args[0][0]
    assert "[Portal Cliente - Empresa Alpha Telecom]" in called_payload.name
    assert "Core Router BGP" in called_payload.content
    assert "client_viewer@infrawatch.ao" in called_payload.content


@pytest.mark.asyncio
async def test_create_support_ticket_sanitizes_xss(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante que tags HTML e scripts maliciosos são escapados no conteúdo do chamado."""
    org_id = uuid4()
    now = datetime.now(UTC)

    async with test_session_factory() as session:
        org = OrganizationModel(
            id=org_id,
            name="Org Protegida",
            slug="org-protegida",
            created_at=now,
        )
        session.add(org)
        await session.commit()

    mock_glpi = AsyncMock()
    mock_glpi.__aenter__.return_value = mock_glpi
    mock_glpi.open_ticket.return_value = 7712

    app.dependency_overrides[get_glpi_client] = lambda: mock_glpi

    token = generate_token("CLIENT_VIEWER", str(org_id))
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "title": "<script>alert('pwned')</script>",
        "description": "<img src=x onerror=alert(1)> Falha crítica com injeção",
        "severity": "CRITICAL",
        "device_id": None,
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/sla/organizations/{org_id}/support-ticket",
            json=payload,
            headers=headers,
        )

    assert resp.status_code == status.HTTP_201_CREATED
    called_payload = mock_glpi.open_ticket.call_args[0][0]

    # Script não pode existir como tag executável
    assert "<script>" not in called_payload.name
    assert "&lt;script&gt;" in called_payload.name
    assert "<img" not in called_payload.content
    assert "&lt;img" in called_payload.content


@pytest.mark.asyncio
async def test_create_support_ticket_blocks_other_org_device_idor(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante que um cliente não pode referenciar um dispositivo de outra organização (Anti-IDOR)."""
    org1_id = uuid4()
    org2_id = uuid4()
    dev_org2_id = uuid4()
    now = datetime.now(UTC)

    async with test_session_factory() as session:
        org1 = OrganizationModel(id=org1_id, name="Org 1", slug="org-1", created_at=now)
        org2 = OrganizationModel(id=org2_id, name="Org 2", slug="org-2", created_at=now)
        session.add_all([org1, org2])

        dev_org2 = DeviceModel(
            id=dev_org2_id,
            organization_id=org2_id,
            name="Servidor Secreto Org 2",
            ip_address="10.0.0.5",
            port=80,
            protocol="HTTP",
            category="SERVER",
            status="UP",
            interval_seconds=30,
            is_paused=False,
            created_at=now,
        )
        session.add(dev_org2)
        await session.commit()

    mock_glpi = AsyncMock()
    app.dependency_overrides[get_glpi_client] = lambda: mock_glpi

    # Cliente autenticado na Org 1 tenta passar o dev da Org 2
    token = generate_token("CLIENT_VIEWER", str(org1_id))
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "title": "Tentativa de acesso indevido",
        "description": "Tentando forjar chamado com device da Org 2.",
        "severity": "MEDIUM",
        "device_id": str(dev_org2_id),
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/sla/organizations/{org1_id}/support-ticket",
            json=payload,
            headers=headers,
        )

    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert (
        "Dispositivo informado não encontrado ou não pertence à sua organização"
        in resp.json()["detail"]
    )
    mock_glpi.open_ticket.assert_not_called()


@pytest.mark.asyncio
async def test_create_support_ticket_forbidden_for_other_org(
    override_get_db,
) -> None:
    """Garante bloqueio 403 Forbidden se o usuário tentar abrir chamado em organização diferente da sua."""
    org1_id = uuid4()
    org2_id = uuid4()

    token_org1 = generate_token("CLIENT_VIEWER", str(org1_id))
    headers = {"Authorization": f"Bearer {token_org1}"}

    payload = {
        "title": "Tentativa de spoofing de organização",
        "description": "Invocando rota com ID da Org 2.",
        "severity": "LOW",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/sla/organizations/{org2_id}/support-ticket",
            json=payload,
            headers=headers,
        )

    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_create_support_ticket_handles_glpi_failure_gracefully(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante retorno 503 com mensagem amigável quando a integração do GLPI falha."""
    org_id = uuid4()
    now = datetime.now(UTC)

    async with test_session_factory() as session:
        org = OrganizationModel(id=org_id, name="Org Falha", slug="org-falha", created_at=now)
        session.add(org)
        await session.commit()

    mock_glpi = AsyncMock()
    mock_glpi.__aenter__.side_effect = GlpiAuthError("GLPI Session Token rejeitado")
    app.dependency_overrides[get_glpi_client] = lambda: mock_glpi

    token = generate_token("CLIENT_VIEWER", str(org_id))
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "title": "Chamado durante indisponibilidade do GLPI",
        "description": "Simulando falha do backend de ITSM.",
        "severity": "HIGH",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/sla/organizations/{org_id}/support-ticket",
            json=payload,
            headers=headers,
        )

    assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "temporariamente indisponível" in resp.json()["detail"]
