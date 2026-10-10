"""Testes de integração das rotas de SLA e Janelas de Manutenção.

Valida:
1. Endpoint GET /api/v1/sla/devices/{id} com downtime não planejado e cálculo exato de 99.72%.
2. Isenção com janela de manutenção aprovada elevando SLA para 100.00%.
3. CRUD completo e aprovação formal em /api/v1/maintenance-windows.
4. Isolamento multitenant entre organizações.
5. Controle de acesso RBAC para perfis não autorizados (viewers).
"""

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
from src.contexts.sla.database.models import MaintenanceWindowModel
from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel
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

    # Garante o registro explícito de todos os modelos no Base.metadata
    _ = (
        OrganizationModel,
        UserModel,
        DeviceModel,
        IncidentModel,
        MaintenanceWindowModel,
        OutboxEventModel,
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
        name="Telecom Angola Provedor",
        slug="telecom-angola-provedor",
    )
    session.add(org)

    operator = UserModel(
        id=uuid4(),
        organization_id=org.id,
        email="noc.operator@telecom.ao",
        full_name="Operador NOC Telecom",
        role=UserRole.NOC_OPERATOR.value,
        is_active=True,
        is_verified=True,
    )
    session.add(operator)

    device = DeviceModel(
        id=uuid4(),
        organization_id=org.id,
        name="BGP Edge Router Luanda",
        hostname="rtr-bgp-01",
        ip_address="196.223.1.1",
        port=179,
        protocol="tcp",
        category="ROUTER",
    )
    session.add(device)

    await session.commit()
    return org, operator, device


@pytest.mark.asyncio
async def test_calculate_sla_with_unplanned_and_exempted_downtime(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Valida o cálculo de 99.72% para queda não planejada de 2h e sua posterior isenção."""
    async with test_session_factory() as session:
        org, operator, device = await seed_base_data(session)

        # Configura intervalo avaliado de exatamente 720 horas (30 dias)
        start_period = datetime(2026, 6, 1, 0, 0, 0, tzinfo=UTC)
        end_period = start_period + timedelta(hours=720)

        # Insere incidente de 2 horas (das 10:00 às 12:00 no dia 5)
        inc_start = start_period + timedelta(days=5, hours=10)
        inc_end = inc_start + timedelta(hours=2)

        incident = IncidentModel(
            id=uuid4(),
            device_id=device.id,
            organization_id=org.id,
            operator_id=operator.id,
            title="Queda no BGP Edge",
            severity="CRITICAL",
            status="RESOLVED",
            started_at=inc_start,
            resolved_at=inc_end,
            downtime_minutes=120,
            root_cause="Falha elétrica restaurada",
        )
        session.add(incident)
        await session.commit()

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 1. Consulta SLA sem janela de manutenção -> Uptime deve ser 99.72%
        url_sla = f"/api/v1/sla/devices/{device.id}"
        query_params = {
            "start_period": start_period.isoformat(),
            "end_period": end_period.isoformat(),
        }
        res_sla_1 = await client.get(url_sla, params=query_params, headers=headers)
        assert res_sla_1.status_code == status.HTTP_200_OK
        data_1 = res_sla_1.json()
        assert data_1["uptime_percentage"] == 99.72
        assert data_1["unplanned_downtime_minutes"] == 120.0
        assert data_1["exempted_downtime_minutes"] == 0.0
        assert data_1["sla_met"] is True  # 99.72 >= 99.50

        # 2. Cadastra janela de manutenção cobrindo o período da queda
        win_payload = {
            "device_id": str(device.id),
            "organization_id": str(org.id),
            "start_time": (inc_start - timedelta(minutes=15)).isoformat(),
            "end_time": (inc_end + timedelta(minutes=15)).isoformat(),
            "description": "Manutenção preventiva do gerador elétrico",
            "is_approved": False,
        }
        res_win = await client.post("/api/v1/maintenance-windows", json=win_payload, headers=headers)
        assert res_win.status_code == status.HTTP_201_CREATED
        window_id = res_win.json()["id"]

        # Janela criada mas ainda não aprovada: SLA continua em 99.72%
        res_sla_unapproved = await client.get(url_sla, params=query_params, headers=headers)
        assert res_sla_unapproved.json()["uptime_percentage"] == 99.72

        # 3. Aprova formalmente a janela de manutenção
        res_appr = await client.post(
            f"/api/v1/maintenance-windows/{window_id}/approve",
            headers=headers,
        )
        assert res_appr.status_code == status.HTTP_200_OK
        assert res_appr.json()["is_approved"] is True

        # 4. Consulta novamente o SLA -> agora a queda de 2h está 100% isenta!
        res_sla_2 = await client.get(url_sla, params=query_params, headers=headers)
        assert res_sla_2.status_code == status.HTTP_200_OK
        data_2 = res_sla_2.json()
        assert data_2["uptime_percentage"] == 100.00
        assert data_2["unplanned_downtime_minutes"] == 0.0
        assert data_2["exempted_downtime_minutes"] == 120.0
        assert data_2["exempted_incidents_count"] == 1


@pytest.mark.asyncio
async def test_maintenance_window_crud_lifecycle(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Valida ciclo completo de CRUD de janelas de manutenção."""
    async with test_session_factory() as session:
        org, operator, device = await seed_base_data(session)

    token = generate_token(operator.id, UserRole.NOC_OPERATOR, org.id)
    headers = {"Authorization": f"Bearer {token}"}

    start_time = datetime(2026, 7, 10, 2, 0, 0, tzinfo=UTC)
    end_time = datetime(2026, 7, 10, 6, 0, 0, tzinfo=UTC)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Create
        payload = {
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "description": "Atualização de firmware do switch",
            "device_id": str(device.id),
            "organization_id": str(org.id),
        }
        res_create = await client.post("/api/v1/maintenance-windows", json=payload, headers=headers)
        assert res_create.status_code == status.HTTP_201_CREATED
        window_id = res_create.json()["id"]

        # List
        res_list = await client.get("/api/v1/maintenance-windows", headers=headers)
        assert res_list.status_code == status.HTTP_200_OK
        assert res_list.json()["total"] >= 1

        # Get
        res_get = await client.get(f"/api/v1/maintenance-windows/{window_id}", headers=headers)
        assert res_get.status_code == status.HTTP_200_OK
        assert res_get.json()["description"] == "Atualização de firmware do switch"

        # Update (Patch)
        res_patch = await client.patch(
            f"/api/v1/maintenance-windows/{window_id}",
            json={"description": "Atualização de firmware e backup de configs"},
            headers=headers,
        )
        assert res_patch.status_code == status.HTTP_200_OK
        assert res_patch.json()["description"] == "Atualização de firmware e backup de configs"

        # Delete
        res_del = await client.delete(f"/api/v1/maintenance-windows/{window_id}", headers=headers)
        assert res_del.status_code == status.HTTP_204_NO_CONTENT

        # Get deleted -> 404 Not Found
        res_after = await client.get(f"/api/v1/maintenance-windows/{window_id}", headers=headers)
        assert res_after.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_sla_and_maintenance_multitenant_isolation(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante que usuários de uma organização não acessem dados de SLA de outra."""
    async with test_session_factory() as session:
        _org_a, _operator_a, device_a = await seed_base_data(session)

        org_b = OrganizationModel(
            id=uuid4(),
            name="Org B Concorrente",
            slug="org-b-concorrente",
        )
        session.add(org_b)
        viewer_b = UserModel(
            id=uuid4(),
            organization_id=org_b.id,
            email="viewer@org-b.com",
            full_name="Viewer Org B",
            role=UserRole.CLIENT_VIEWER.value,
            is_active=True,
            is_verified=True,
        )
        session.add(viewer_b)
        await session.commit()

    token_viewer_b = generate_token(viewer_b.id, UserRole.CLIENT_VIEWER, org_b.id)
    headers_b = {"Authorization": f"Bearer {token_viewer_b}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Viewer da Org B tenta consultar SLA do dispositivo da Org A -> 403 Forbidden
        res_sla_forbidden = await client.get(
            f"/api/v1/sla/devices/{device_a.id}",
            headers=headers_b,
        )
        assert res_sla_forbidden.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_rbac_restrictions_on_maintenance_windows(
    test_session_factory: async_sessionmaker[AsyncSession],
    override_get_db: None,
) -> None:
    """Garante que o perfil CLIENT_VIEWER não pode criar, aprovar ou excluir janelas."""
    async with test_session_factory() as session:
        org, _, _ = await seed_base_data(session)
        viewer = UserModel(
            id=uuid4(),
            organization_id=org.id,
            email="client.viewer@teste.com",
            full_name="Viewer",
            role=UserRole.CLIENT_VIEWER.value,
            is_active=True,
            is_verified=True,
        )
        session.add(viewer)
        await session.commit()

    token_viewer = generate_token(viewer.id, UserRole.CLIENT_VIEWER, org.id)
    headers = {"Authorization": f"Bearer {token_viewer}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Tentativa de criar -> 403 Forbidden
        res_create = await client.post(
            "/api/v1/maintenance-windows",
            json={
                "start_time": datetime.now(UTC).isoformat(),
                "end_time": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
                "description": "Tentativa não autorizada",
            },
            headers=headers,
        )
        assert res_create.status_code == status.HTTP_403_FORBIDDEN

        # Tentativa de aprovar -> 403 Forbidden
        res_appr = await client.post(
            f"/api/v1/maintenance-windows/{uuid4()}/approve",
            headers=headers,
        )
        assert res_appr.status_code == status.HTTP_403_FORBIDDEN

        # Tentativa de deletar -> 403 Forbidden
        res_del = await client.delete(
            f"/api/v1/maintenance-windows/{uuid4()}",
            headers=headers,
        )
        assert res_del.status_code == status.HTTP_403_FORBIDDEN
