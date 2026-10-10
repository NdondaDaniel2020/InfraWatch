"""Testes de integração do fluxo completo de gestão de incidentes.

Valida:
1. Criação de incidente (TRIGGERED).
2. Listagem com filtros e paginação.
3. Detalhes do incidente por ID.
4. Reconhecimento operacional (ACKNOWLEDGED) com vinculação de operador.
5. Resolução com justificativa técnica (RESOLVED) e cálculo de downtime em minutos.
6. Tratamento de concorrência e idempotência (409 Conflict se tentar reconhecer/resolver já resolvido).
7. Validação de causa raiz obrigatória.
8. Isolamento multitenant (403 Forbidden para tenants diferentes).
9. Controle de acesso por perfil (RBAC: viewers não podem criar/alterar status).
10. Transmissão de eventos de broadcast SSE.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from typing import Any
from uuid import UUID, uuid4

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

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser
from src.contexts.iam.database.models import OrganizationModel, UserModel
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.inventory.database.models import DeviceModel
from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel
from src.core.database.session import get_db_session
from src.core.messaging.sse_broadcaster import get_sse_broadcaster
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


async def seed_base_data(session: AsyncSession) -> tuple[OrganizationModel, UserModel, DeviceModel]:
    """Popula organização, operador e dispositivo para o fluxo de testes."""
    org = OrganizationModel(
        id=uuid4(),
        name="Empresa Teste Luanda",
        slug="empresa-teste-luanda",
    )
    session.add(org)

    operator = UserModel(
        id=uuid4(),
        organization_id=org.id,
        email="operator@infrawatch.io",
        full_name="Operador NOC 1",
        role=UserRole.NOC_OPERATOR.value,
        is_active=True,
        is_verified=True,
    )
    session.add(operator)

    device = DeviceModel(
        id=uuid4(),
        organization_id=org.id,
        name="Core Switch DC1",
        hostname="sw-core-01",
        ip_address="10.10.10.1",
        port=22,
        protocol="ssh",
        category="SWITCH",
    )
    session.add(device)

    await session.commit()
    return org, operator, device


@pytest.mark.asyncio
async def test_incident_full_lifecycle(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Valida o ciclo de vida completo de um incidente: TRIGGERED -> ACKNOWLEDGED -> RESOLVED."""
    async with test_session_factory() as session:
        org, operator, device = await seed_base_data(session)

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 1. Criação do incidente
        create_payload = {
            "device_id": str(device.id),
            "organization_id": str(org.id),
            "title": "Perda total de conectividade com Switch DC1",
            "severity": "CRITICAL",
        }
        res_create = await client.post("/api/v1/incidents", json=create_payload, headers=headers)
        assert res_create.status_code == status.HTTP_201_CREATED
        data_create = res_create.json()
        incident_id = data_create["id"]

        assert data_create["title"] == "Perda total de conectividade com Switch DC1"
        assert data_create["status"] == "TRIGGERED"
        assert data_create["severity"] == "CRITICAL"
        assert data_create["operator_id"] is None
        assert data_create["acknowledged_at"] is None
        assert data_create["resolved_at"] is None
        assert data_create["downtime_minutes"] is None

        # 2. Listagem de incidentes
        res_list = await client.get("/api/v1/incidents?status=TRIGGERED", headers=headers)
        assert res_list.status_code == status.HTTP_200_OK
        list_json = res_list.json()
        assert list_json["total"] >= 1
        assert any(i["id"] == incident_id for i in list_json["items"])

        # 3. Detalhes por ID
        res_detail = await client.get(f"/api/v1/incidents/{incident_id}", headers=headers)
        assert res_detail.status_code == status.HTTP_200_OK
        assert res_detail.json()["id"] == incident_id

        # 4. Reconhecimento operacional (Acknowledge)
        res_ack = await client.post(
            f"/api/v1/incidents/{incident_id}/acknowledge",
            headers=headers,
        )
        assert res_ack.status_code == status.HTTP_200_OK
        data_ack = res_ack.json()
        assert data_ack["status"] == "ACKNOWLEDGED"
        assert data_ack["operator_id"] == str(operator.id)
        assert data_ack["acknowledged_at"] is not None

        # 5. Resolução com causa raiz (Resolve)
        resolve_payload = {
            "root_cause": "Fonte de alimentação redundante substituída com sucesso.",
        }
        res_res = await client.post(
            f"/api/v1/incidents/{incident_id}/resolve",
            json=resolve_payload,
            headers=headers,
        )
        assert res_res.status_code == status.HTTP_200_OK
        data_res = res_res.json()
        assert data_res["status"] == "RESOLVED"
        assert data_res["root_cause"] == "Fonte de alimentação redundante substituída com sucesso."
        assert data_res["resolved_at"] is not None
        assert data_res["downtime_minutes"] is not None
        assert data_res["downtime_minutes"] >= 0

    # 6. Verifica eventos gravados no Transactional Outbox
    async with test_session_factory() as session:
        events = (
            (
                await session.execute(
                    select(OutboxEventModel).filter(
                        OutboxEventModel.aggregate_type == "Incident"
                    )
                )
            )
            .scalars()
            .all()
        )
        event_types = [e.event_type for e in events]
        assert "IncidentTriggeredEvent" in event_types
        assert "IncidentAcknowledgedEvent" in event_types
        assert "IncidentResolvedEvent" in event_types


@pytest.mark.asyncio
async def test_conflict_guards_on_resolved_incident(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante que incidentes resolvidos não podem ser reconhecidos ou resolvidos novamente."""
    async with test_session_factory() as session:
        org, operator, device = await seed_base_data(session)

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Cria e resolve imediatamente
        res = await client.post(
            "/api/v1/incidents",
            json={
                "device_id": str(device.id),
                "title": "Alerta Switch",
            },
            headers=headers,
        )
        incident_id = res.json()["id"]

        await client.post(
            f"/api/v1/incidents/{incident_id}/resolve",
            json={"root_cause": "Falso positivo resolvido."},
            headers=headers,
        )

        # Tentativa de novo reconhecimento -> 409 Conflict
        res_ack_conflict = await client.post(
            f"/api/v1/incidents/{incident_id}/acknowledge",
            headers=headers,
        )
        assert res_ack_conflict.status_code == status.HTTP_409_CONFLICT

        # Tentativa de nova resolução -> 409 Conflict
        res_res_conflict = await client.post(
            f"/api/v1/incidents/{incident_id}/resolve",
            json={"root_cause": "Tentativa duplicada"},
            headers=headers,
        )
        assert res_res_conflict.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_resolve_requires_root_cause(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante validação de causa raiz obrigatória."""
    async with test_session_factory() as session:
        org, operator, device = await seed_base_data(session)

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(
            "/api/v1/incidents",
            json={
                "device_id": str(device.id),
                "title": "Falha de teste",
            },
            headers=headers,
        )
        incident_id = res.json()["id"]

        # Causa raiz em branco -> 422 Unprocessable Content ou 400 Bad Request
        res_invalid = await client.post(
            f"/api/v1/incidents/{incident_id}/resolve",
            json={"root_cause": "   "},
            headers=headers,
        )
        assert res_invalid.status_code in {status.HTTP_400_BAD_REQUEST, 422}


@pytest.mark.asyncio
async def test_incident_not_found_endpoints(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante retorno 404 para identificadores inexistentes."""
    async with test_session_factory() as session:
        org, operator, _ = await seed_base_data(session)

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}
    fake_id = uuid4()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res_get = await client.get(f"/api/v1/incidents/{fake_id}", headers=headers)
        assert res_get.status_code == status.HTTP_404_NOT_FOUND

        res_ack = await client.post(f"/api/v1/incidents/{fake_id}/acknowledge", headers=headers)
        assert res_ack.status_code == status.HTTP_404_NOT_FOUND

        res_res = await client.post(
            f"/api/v1/incidents/{fake_id}/resolve",
            json={"root_cause": "Não existe"},
            headers=headers,
        )
        assert res_res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_multitenant_access_isolation(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante isolamento: usuário de tenant A não pode visualizar incidente de tenant B."""
    async with test_session_factory() as session:
        org_a, operator_a, device_a = await seed_base_data(session)

        org_b = OrganizationModel(
            id=uuid4(),
            name="Empresa B",
            slug="empresa-b",
        )
        session.add(org_b)
        viewer_b = UserModel(
            id=uuid4(),
            organization_id=org_b.id,
            email="viewer@empresa-b.com",
            full_name="Viewer Empresa B",
            role=UserRole.CLIENT_VIEWER.value,
            is_active=True,
            is_verified=True,
        )
        session.add(viewer_b)
        await session.commit()

    token_operator_a = generate_token(operator_a.id, UserRole.NOC_OPERATOR, org_a.id)
    token_viewer_b = generate_token(viewer_b.id, UserRole.CLIENT_VIEWER, org_b.id)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Operador cria incidente no Tenant A
        res = await client.post(
            "/api/v1/incidents",
            json={
                "device_id": str(device_a.id),
                "organization_id": str(org_a.id),
                "title": "Incidente Privado Org A",
            },
            headers={"Authorization": f"Bearer {token_operator_a}"},
        )
        incident_id = res.json()["id"]

        # Viewer do Tenant B tenta acessar diretamente incidente da Org A -> 403 Forbidden
        res_forbidden = await client.get(
            f"/api/v1/incidents/{incident_id}",
            headers={"Authorization": f"Bearer {token_viewer_b}"},
        )
        assert res_forbidden.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_rbac_restrictions_on_viewer_role(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante que usuários com perfil CLIENT_VIEWER não podem criar ou alterar incidentes."""
    async with test_session_factory() as session:
        org, _, device = await seed_base_data(session)
        viewer = UserModel(
            id=uuid4(),
            organization_id=org.id,
            email="viewer@test.com",
            full_name="Viewer",
            role=UserRole.CLIENT_VIEWER.value,
            is_active=True,
            is_verified=True,
        )
        session.add(viewer)
        await session.commit()

    token = generate_token(viewer.id, UserRole.CLIENT_VIEWER, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Tentativa de criar -> 403 Forbidden
        res_create = await client.post(
            "/api/v1/incidents",
            json={"device_id": str(device.id), "title": "Falha"},
            headers=headers,
        )
        assert res_create.status_code == status.HTTP_403_FORBIDDEN

        # Tentativa de acknowledge -> 403 Forbidden
        res_ack = await client.post(
            f"/api/v1/incidents/{uuid4()}/acknowledge",
            headers=headers,
        )
        assert res_ack.status_code == status.HTTP_403_FORBIDDEN

        # Tentativa de resolve -> 403 Forbidden
        res_res = await client.post(
            f"/api/v1/incidents/{uuid4()}/resolve",
            json={"root_cause": "Teste"},
            headers=headers,
        )
        assert res_res.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_sse_broadcast_triggered_on_acknowledge_and_resolve(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante que eventos SSE são emitidos para clientes conectados ao reconhecer e resolver."""
    async with test_session_factory() as session:
        org, operator, device = await seed_base_data(session)

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Conecta cliente mock no SSEBroadcaster
    broadcaster = get_sse_broadcaster()
    client_auth_user = AuthenticatedUser(
        id=str(operator.id),
        email=operator.email,
        role=UserRole.NOC_OPERATOR,
        organization_id=str(org.id),
    )
    conn_id, queue = await broadcaster.connect(client_auth_user)

    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # 1. Cria incidente
            res = await client.post(
                "/api/v1/incidents",
                json={
                    "device_id": str(device.id),
                    "organization_id": str(org.id),
                    "title": "Incidente para teste SSE",
                },
                headers=headers,
            )
            incident_id = res.json()["id"]

            # 2. Reconhece incidente
            await client.post(
                f"/api/v1/incidents/{incident_id}/acknowledge",
                headers=headers,
            )

            # 3. Resolve incidente
            await client.post(
                f"/api/v1/incidents/{incident_id}/resolve",
                json={"root_cause": "Cabo restaurado"},
                headers=headers,
            )

        # Coleta eventos recebidos na fila SSE
        received_event_types: list[str] = []
        while not queue.empty():
            msg = queue.get_nowait()
            event_type = msg.get("event_type")
            if event_type:
                received_event_types.append(event_type)

        assert "IncidentTriggeredEvent" in received_event_types
        assert "IncidentAcknowledgedEvent" in received_event_types
        assert "IncidentResolvedEvent" in received_event_types

    finally:
        await broadcaster.disconnect(conn_id)
