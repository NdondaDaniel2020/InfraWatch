"""Testes unitários do TopologyService."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.network_topology.domain.models import (
    EdgeAlreadyExistsError,
    MissingIpAddressError,
    NodeNotFoundError,
    TopologyGraph,
    TopologyNode,
)
from src.contexts.network_topology.services.topology_service import TopologyService


@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.get_graph = AsyncMock()
    repo.get_node = AsyncMock()
    repo.save_node = AsyncMock(side_effect=lambda n: n)
    repo.delete_node = AsyncMock(return_value=True)
    repo.get_edge = AsyncMock()
    repo.save_edge = AsyncMock(side_effect=lambda e: e)
    repo.delete_edge = AsyncMock(return_value=True)
    repo.edge_exists_between = AsyncMock(return_value=False)
    return repo


@pytest.fixture
def mock_event_bus():
    bus = MagicMock()
    bus.publish = AsyncMock(return_value=True)
    return bus


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.commit = AsyncMock()
    # Para execute select(DeviceModel) retornar vazio
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result
    return session


@pytest.fixture
def service(mock_session, mock_event_bus, mock_repo):
    return TopologyService(
        uow_or_session=mock_session,
        event_bus=mock_event_bus,
        repository=mock_repo,
    )


@pytest.mark.asyncio
async def test_get_graph_returns_graph(service, mock_repo):
    org_id = uuid4()
    mock_repo.get_graph.return_value = TopologyGraph(nodes=[], edges=[])

    graph, statuses = await service.get_graph(org_id)
    assert graph.total_nodes == 0
    assert statuses == {}
    mock_repo.get_graph.assert_awaited_once_with(org_id)


@pytest.mark.asyncio
async def test_create_node_success(service, mock_repo):
    org_id = uuid4()
    node = await service.create_node(
        organization_id=org_id,
        label="Router-01",
        node_type="device",
        ip_address="192.168.1.1",
    )
    assert node.label == "Router-01"
    assert node.organization_id == org_id
    mock_repo.save_node.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_node_position_success(service, mock_repo):
    node_id = uuid4()
    org_id = uuid4()
    existing_node = TopologyNode(id=node_id, label="RT", node_type="device", organization_id=org_id)
    mock_repo.get_node.return_value = existing_node

    updated = await service.update_node_position(node_id, org_id, 100.0, 200.0)
    assert updated.position_x == 100.0
    assert updated.position_y == 200.0


@pytest.mark.asyncio
async def test_update_node_position_not_found(service, mock_repo):
    mock_repo.get_node.return_value = None
    with pytest.raises(NodeNotFoundError):
        await service.update_node_position(uuid4(), uuid4(), 10.0, 10.0)


@pytest.mark.asyncio
async def test_create_edge_success(service, mock_repo):
    org_id = uuid4()
    n1 = TopologyNode(id=uuid4(), label="N1", node_type="device", organization_id=org_id)
    n2 = TopologyNode(id=uuid4(), label="N2", node_type="device", organization_id=org_id)

    mock_repo.get_node.side_effect = [n1, n2]
    mock_repo.edge_exists_between.return_value = False

    edge = await service.create_edge(
        organization_id=org_id,
        source_node_id=n1.id,
        target_node_id=n2.id,
        link_type="fiber",
    )
    assert edge.source_node_id == n1.id
    assert edge.target_node_id == n2.id
    assert edge.link_type == "fiber"


@pytest.mark.asyncio
async def test_create_edge_already_exists(service, mock_repo):
    org_id = uuid4()
    n1 = TopologyNode(id=uuid4(), label="N1", node_type="device", organization_id=org_id)
    n2 = TopologyNode(id=uuid4(), label="N2", node_type="device", organization_id=org_id)

    mock_repo.get_node.side_effect = [n1, n2]
    mock_repo.edge_exists_between.return_value = True

    with pytest.raises(EdgeAlreadyExistsError):
        await service.create_edge(
            organization_id=org_id,
            source_node_id=n1.id,
            target_node_id=n2.id,
        )


@pytest.mark.asyncio
async def test_dispatch_ondemand_probe_success(service, mock_repo, mock_event_bus):
    org_id = uuid4()
    node_id = uuid4()
    node = TopologyNode(
        id=node_id,
        label="RT-EDGE",
        node_type="device",
        organization_id=org_id,
        ip_address="10.0.0.1",
    )
    mock_repo.get_node.return_value = node

    probe_id, ip, channel = await service.dispatch_ondemand_probe(node_id, org_id)
    assert ip == "10.0.0.1"
    assert channel == f"probe:{probe_id}"
    mock_event_bus.publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_dispatch_ondemand_probe_missing_ip(service, mock_repo):
    org_id = uuid4()
    node_id = uuid4()
    node = TopologyNode(
        id=node_id,
        label="Switch-Sem-IP",
        node_type="device",
        organization_id=org_id,
        ip_address=None,
    )
    mock_repo.get_node.return_value = node

    with pytest.raises(MissingIpAddressError):
        await service.dispatch_ondemand_probe(node_id, org_id)
