"""Testes de integração das rotas REST de Topologia de Rede (/api/v1/topology).

Valida:
1. GET /api/v1/topology/graph (retorno de nós e enlaces com status 200)
2. POST /api/v1/topology/nodes (criação de nó com status 201)
3. PATCH /api/v1/topology/nodes/{id}/position (atualização de coordenadas)
4. POST /api/v1/topology/edges (criação de enlace com status 201)
5. Validação de duplicidade de enlaces (409 Conflict)
6. POST /api/v1/topology/nodes/{id}/probe (disparo de sonda on-demand com status 200)
7. DELETE /api/v1/topology/edges/{id} (status 204)
8. DELETE /api/v1/topology/nodes/{id} (status 204)
9. RBAC: CLIENT_VIEWER não pode criar nós (status 403)
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import status
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser, get_current_user
from src.contexts.iam.domain.enums import UserRole
from src.contexts.network.topology.api.dependencies import get_topology_service
from src.contexts.network.topology.services.topology_service import TopologyService
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
from src.core.messaging.in_memory_bus import InMemoryEventBus
from src.core.web.dependencies import get_event_bus
from src.main import create_app


@pytest.fixture
async def in_memory_db() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria engine SQLite em memória para os testes de integração de topologia."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield session_factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
def test_org_id() -> UUID:
    return uuid4()


@pytest.fixture
def super_admin_user(test_org_id: UUID) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="admin@infrawatch.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=str(test_org_id),
    )


@pytest.fixture
def client_viewer_user(test_org_id: UUID) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="viewer@client.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(test_org_id),
    )


@pytest.fixture
async def async_client(
    in_memory_db: async_sessionmaker[AsyncSession],
    super_admin_user: AuthenticatedUser,
) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Cliente HTTP assíncrono conectado ao app com dependências sobrescritas."""
    app = create_app()
    event_bus = InMemoryEventBus()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with in_memory_db() as session:
            yield session

    def override_get_current_user() -> AuthenticatedUser:
        return super_admin_user

    def override_get_event_bus() -> InMemoryEventBus:
        return event_bus

    async def override_get_topology_service() -> AsyncGenerator[TopologyService, None]:
        async with in_memory_db() as session:
            yield TopologyService(
                uow_or_session=session,
                event_bus=event_bus,
            )

    app.dependency_overrides[get_db_session] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_event_bus] = override_get_event_bus
    app.dependency_overrides[get_topology_service] = override_get_topology_service

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_topology_graph_empty(async_client: httpx.AsyncClient, test_org_id: UUID):
    """GET /api/v1/topology/graph retorna grafo vazio se nenhum nó cadastrado."""
    resp = await async_client.get(
        "/api/v1/topology/graph",
        params={"organization_id": str(test_org_id)},
    )
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["total_nodes"] == 0
    assert data["total_edges"] == 0
    assert data["nodes"] == []
    assert data["edges"] == []


@pytest.mark.asyncio
async def test_topology_full_lifecycle(async_client: httpx.AsyncClient, test_org_id: UUID):
    """Ciclo completo: Criar 2 nós, ligar com enlace, testar probe, atualizar e remover."""
    # 1. Cria nó de origem
    node1_payload = {
        "label": "RT-CORE-01",
        "node_type": "device",
        "ip_address": "10.0.1.1",
        "cluster": "LUANDA-HUB",
        "position_x": 100.0,
        "position_y": 150.0,
    }
    r1 = await async_client.post(
        "/api/v1/topology/nodes",
        params={"organization_id": str(test_org_id)},
        json=node1_payload,
    )
    assert r1.status_code == status.HTTP_201_CREATED
    node1 = r1.json()
    assert node1["label"] == "RT-CORE-01"
    assert node1["ip_address"] == "10.0.1.1"

    # 2. Cria nó de destino
    node2_payload = {
        "label": "SW-ACCESS-01",
        "node_type": "device",
        "ip_address": "10.0.1.2",
        "cluster": "LUANDA-HUB",
        "position_x": 300.0,
        "position_y": 150.0,
    }
    r2 = await async_client.post(
        "/api/v1/topology/nodes",
        params={"organization_id": str(test_org_id)},
        json=node2_payload,
    )
    assert r2.status_code == status.HTTP_201_CREATED
    node2 = r2.json()

    # 3. Atualiza posição do nó 1
    r_pos = await async_client.patch(
        f"/api/v1/topology/nodes/{node1['id']}/position",
        params={"organization_id": str(test_org_id)},
        json={"position_x": 120.0, "position_y": 160.0},
    )
    assert r_pos.status_code == status.HTTP_200_OK
    assert r_pos.json()["position_x"] == 120.0

    # 4. Cria enlace entre nó 1 e nó 2
    edge_payload = {
        "source_node_id": node1["id"],
        "target_node_id": node2["id"],
        "link_type": "fiber",
        "bandwidth_gbps": 10.0,
        "port_src": "GE0/0/1",
        "port_dst": "GE0/0/24",
    }
    r_edge = await async_client.post(
        "/api/v1/topology/edges",
        params={"organization_id": str(test_org_id)},
        json=edge_payload,
    )
    assert r_edge.status_code == status.HTTP_201_CREATED
    edge = r_edge.json()
    assert edge["link_type"] == "fiber"

    # 5. Tentativa de criar enlace duplicado -> 409 Conflict
    r_dup = await async_client.post(
        "/api/v1/topology/edges",
        params={"organization_id": str(test_org_id)},
        json=edge_payload,
    )
    assert r_dup.status_code == status.HTTP_409_CONFLICT

    # 6. Consulta do Grafo Completo
    r_graph = await async_client.get(
        "/api/v1/topology/graph",
        params={"organization_id": str(test_org_id)},
    )
    assert r_graph.status_code == status.HTTP_200_OK
    graph = r_graph.json()
    assert graph["total_nodes"] == 2
    assert graph["total_edges"] == 1
    assert graph["cluster"] == "LUANDA-HUB"

    # 7. Disparo de teste de ping on-demand
    r_probe = await async_client.post(
        f"/api/v1/topology/nodes/{node1['id']}/probe",
        params={"organization_id": str(test_org_id)},
        json={"timeout_ms": 3000},
    )
    assert r_probe.status_code == status.HTTP_200_OK
    probe_data = r_probe.json()
    assert "probe_id" in probe_data
    assert probe_data["ip_address"] == "10.0.1.1"
    assert f"probe:{probe_data['probe_id']}" in probe_data["sse_channel"]

    # 8. Remoção do enlace
    r_del_edge = await async_client.delete(
        f"/api/v1/topology/edges/{edge['id']}",
        params={"organization_id": str(test_org_id)},
    )
    assert r_del_edge.status_code == status.HTTP_204_NO_CONTENT

    # 9. Remoção do nó
    r_del_node = await async_client.delete(
        f"/api/v1/topology/nodes/{node1['id']}",
        params={"organization_id": str(test_org_id)},
    )
    assert r_del_node.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.asyncio
async def test_rbac_client_viewer_cannot_create_node(
    in_memory_db: async_sessionmaker[AsyncSession],
    client_viewer_user: AuthenticatedUser,
    test_org_id: UUID,
):
    """CLIENT_VIEWER recebe 403 Forbidden ao tentar criar nós na topologia."""
    app = create_app()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with in_memory_db() as session:
            yield session

    def override_get_current_user() -> AuthenticatedUser:
        return client_viewer_user

    app.dependency_overrides[get_db_session] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/topology/nodes",
            params={"organization_id": str(test_org_id)},
            json={"label": "Unauthorized-Node", "node_type": "device"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    app.dependency_overrides.clear()
