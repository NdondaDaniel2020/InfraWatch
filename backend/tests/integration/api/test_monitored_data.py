"""Testes de integração para as rotas REST de dados monitorados e telemetria.

Valida:
1. Autenticação obrigatória (401 sem token ou com token inválido).
2. Listagem consolidada de ativos monitorados com suas últimas métricas coletadas.
3. Consulta detalhada de telemetria por dispositivo e série temporal recente de métricas.
4. Isolamento estrito de multitenancy por organização.
5. Rotas alternativas/aliases (/api/v1/events/monitored e /api/v1/events/devices/{id}).
"""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
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

from src.contexts.iam.security.tokens import create_access_token
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
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
        dbapi_connection.create_function("to_tsvector", 2, lambda lang, text: text, deterministic=True)

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
    payload = {
        "sub": str(uuid4()),
        "email": f"{role.lower()}@infrawatch.ao",
        "role": role,
        "organization_id": org_id,
    }
    return create_access_token(payload)


@pytest.mark.asyncio
async def test_monitored_routes_unauthorized_without_token() -> None:
    """Garante que as rotas REST de telemetria exigem autenticação válida."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp_list = await client.get("/api/v1/events/telemetry")
        assert resp_list.status_code == status.HTTP_401_UNAUTHORIZED

        resp_detail = await client.get(f"/api/v1/events/telemetry/{uuid4()}")
        assert resp_detail.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_list_monitored_telemetry_with_metrics(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante listagem de dispositivos monitorados enriquecida com a telemetria mais recente."""
    org_id = uuid4()
    dev1_id = uuid4()
    dev2_id = uuid4()
    now = datetime.now(UTC)

    async with test_session_factory() as session:
        dev1 = DeviceModel(
            id=dev1_id,
            organization_id=org_id,
            name="Router Core Luanda",
            ip_address="192.168.10.1",
            port=0,
            protocol="ICMP",
            category="ROUTER",
            status="UP",
            interval_seconds=30,
        )
        dev2 = DeviceModel(
            id=dev2_id,
            organization_id=org_id,
            name="Switch Acesso Benguela",
            ip_address="192.168.20.1",
            port=22,
            protocol="TCP",
            category="SWITCH",
            status="DEGRADED",
            interval_seconds=60,
        )
        session.add_all([dev1, dev2])

        # Métricas do dev1 (mais recente: latency 4.5ms)
        m1_old = MetricModel(
            id=1,
            device_id=dev1_id,
            organization_id=org_id,
            metric_type="latency_ms",
            value=8.2,
            packet_loss=0.0,
            status="UP",
            timestamp=now - timedelta(minutes=5),
        )
        m1_new = MetricModel(
            id=2,
            device_id=dev1_id,
            organization_id=org_id,
            metric_type="latency_ms",
            value=4.5,
            packet_loss=0.0,
            status="UP",
            timestamp=now,
        )
        session.add_all([m1_old, m1_new])
        await session.commit()

    token = generate_token("NOC_OPERATOR", str(org_id))
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Rota principal
        resp = await client.get("/api/v1/events/telemetry", headers=headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

        # Valida que o dev1 possui a medição mais recente (4.5ms)
        dev1_data = next(item for item in data["items"] if item["device_id"] == str(dev1_id))
        assert dev1_data["name"] == "Router Core Luanda"
        assert dev1_data["last_latency_ms"] == 4.5
        assert dev1_data["last_packet_loss"] == 0.0
        assert dev1_data["last_monitored_at"] is not None

        # Valida que dev2 (sem métricas) retorna last_latency_ms como None
        dev2_data = next(item for item in data["items"] if item["device_id"] == str(dev2_id))
        assert dev2_data["name"] == "Switch Acesso Benguela"
        assert dev2_data["last_latency_ms"] is None

        # 2. Filtro por status
        resp_up = await client.get("/api/v1/events/telemetry?status=UP", headers=headers)
        assert resp_up.status_code == status.HTTP_200_OK
        data_up = resp_up.json()
        assert data_up["total"] == 1
        assert data_up["items"][0]["status"] == "UP"

        # 3. Rota alias (/monitored)
        resp_alias = await client.get("/api/v1/events/monitored", headers=headers)
        assert resp_alias.status_code == status.HTTP_200_OK
        assert resp_alias.json()["total"] == 2


@pytest.mark.asyncio
async def test_get_device_telemetry_detail_and_metrics_series(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida consulta detalhada de telemetria de um dispositivo com histórico recente."""
    org_id = uuid4()
    dev_id = uuid4()
    now = datetime.now(UTC)

    async with test_session_factory() as session:
        dev = DeviceModel(
            id=dev_id,
            organization_id=org_id,
            name="Firewall Edge",
            hostname="fw-edge.infrawatch.ao",
            ip_address="10.10.0.1",
            port=443,
            protocol="HTTP",
            category="FIREWALL",
            status="UP",
            interval_seconds=15,
        )
        session.add(dev)

        for i in range(3):
            metric = MetricModel(
                id=10 + i,
                device_id=dev_id,
                organization_id=org_id,
                metric_type="latency_ms",
                value=10.0 + i,
                packet_loss=float(i),
                status="UP",
                timestamp=now - timedelta(seconds=i * 15),
            )
            session.add(metric)
        await session.commit()

    token = generate_token("NOC_OPERATOR", str(org_id))
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Rota principal
        resp = await client.get(f"/api/v1/events/telemetry/{dev_id}", headers=headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        assert data["device_id"] == str(dev_id)
        assert data["name"] == "Firewall Edge"
        assert data["hostname"] == "fw-edge.infrawatch.ao"
        assert data["port"] == 443
        assert data["last_latency_ms"] == 10.0
        assert len(data["recent_metrics"]) == 3

        # Rota alias (/devices/{device_id})
        resp_alias = await client.get(f"/api/v1/events/devices/{dev_id}", headers=headers)
        assert resp_alias.status_code == status.HTTP_200_OK
        assert resp_alias.json()["device_id"] == str(dev_id)

        # Dispositivo inexistente
        resp_404 = await client.get(f"/api/v1/events/telemetry/{uuid4()}", headers=headers)
        assert resp_404.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_telemetry_multitenancy_isolation(
    override_get_db,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Valida isolamento estrito entre organizações (Client A vs Client B)."""
    org_a = uuid4()
    org_b = uuid4()
    dev_a_id = uuid4()

    async with test_session_factory() as session:
        dev_a = DeviceModel(
            id=dev_a_id,
            organization_id=org_a,
            name="Servidor Org A",
            ip_address="10.1.1.1",
            port=80,
            protocol="ICMP",
            category="SERVER",
            status="UP",
        )
        session.add(dev_a)
        await session.commit()

    token_b = generate_token("CLIENT_VIEWER", str(org_b))
    headers_b = {"Authorization": f"Bearer {token_b}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Usuário da org_b não enxerga dispositivo da org_a na listagem
        resp_list = await client.get("/api/v1/events/telemetry", headers=headers_b)
        assert resp_list.status_code == status.HTTP_200_OK
        assert resp_list.json()["total"] == 0

        # Usuário da org_b recebe 404 ao tentar acessar diretamente ativo da org_a
        resp_detail = await client.get(f"/api/v1/events/telemetry/{dev_a_id}", headers=headers_b)
        assert resp_detail.status_code == status.HTTP_404_NOT_FOUND

        # Super Admin tem acesso global à telemetria
        token_admin = generate_token("SUPER_ADMIN", None)
        headers_admin = {"Authorization": f"Bearer {token_admin}"}
        resp_admin = await client.get("/api/v1/events/telemetry", headers=headers_admin)
        assert resp_admin.status_code == status.HTTP_200_OK
        assert resp_admin.json()["total"] == 1
