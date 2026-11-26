"""Testes unitários para TopologyRepository (Network Topology)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.network_topology.database.models import TopologyEdgeModel, TopologyNodeModel
from src.contexts.network_topology.database.repository import TopologyRepository
from src.contexts.network_topology.domain.models import TopologyEdge, TopologyNode


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.mark.asyncio
async def test_get_graph_and_default_org(mock_session) -> None:
    """Valida montagem do grafo com nós e apenas arestas conectadas aos nós válidos."""
    repo = TopologyRepository(session=mock_session)
    org_id = uuid4()
    node1_id = uuid4()
    node2_id = uuid4()
    orphan_id = uuid4()

    node1 = TopologyNode(id=node1_id, organization_id=org_id, label="R1", node_type="ROUTER")
    node2 = TopologyNode(id=node2_id, organization_id=org_id, label="SW1", node_type="SWITCH")
    edge_valid = TopologyEdge(
        id=uuid4(), organization_id=org_id, source_node_id=node1_id, target_node_id=node2_id
    )
    edge_orphan = TopologyEdge(
        id=uuid4(), organization_id=org_id, source_node_id=node1_id, target_node_id=orphan_id
    )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(repo, "list_nodes", AsyncMock(return_value=[node1, node2]))
        mp.setattr(repo, "list_edges", AsyncMock(return_value=[edge_valid, edge_orphan]))

        graph = await repo.get_graph(org_id)
        assert len(graph.nodes) == 2
        assert len(graph.edges) == 1
        assert graph.edges[0].id == edge_valid.id

    # get_default_organization_id
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = org_id
    mock_session.execute.return_value = mock_result
    found_org = await repo.get_default_organization_id()
    assert found_org == org_id


@pytest.mark.asyncio
async def test_nodes_lifecycle(mock_session) -> None:
    """Valida listagem, busca, salvamento (insert/update) e exclusão de nós."""
    repo = TopologyRepository(session=mock_session)
    org_id = uuid4()
    node_id = uuid4()
    now = datetime.now(UTC)

    model = TopologyNodeModel(
        id=node_id,
        organization_id=org_id,
        label="Gateway",
        node_type="router",
        device_id=uuid4(),
        ip_address="192.168.1.254",
        cluster="core",
        position_x=100.0,
        position_y=200.0,
        created_at=now,
        updated_at=now,
    )

    # 1. list_nodes
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [model]
    mock_session.execute.return_value = mock_result

    nodes = await repo.list_nodes(org_id)
    assert len(nodes) == 1
    assert nodes[0].id == node_id
    assert nodes[0].label == "Gateway"

    # 2. get_node
    mock_result.scalar_one_or_none.return_value = model
    node = await repo.get_node(node_id, org_id)
    assert node is not None
    assert node.ip_address == "192.168.1.254"

    # 3. save_node (update)
    updated_domain = TopologyNode(
        id=node_id,
        organization_id=org_id,
        label="Gateway Updated",
        node_type="router",
    )
    saved = await repo.save_node(updated_domain)
    assert saved.label == "Gateway Updated"
    mock_session.flush.assert_awaited()

    # 4. delete_node
    mock_del_result = MagicMock()
    mock_del_result.rowcount = 1
    mock_session.execute.return_value = mock_del_result
    assert await repo.delete_node(node_id, org_id) is True

    # 5. get_clusters_by_device_ids
    dev_id = uuid4()
    mock_cluster_res = MagicMock()
    mock_cluster_res.all.return_value = [(dev_id, "DC-Norte")]
    mock_session.execute.return_value = mock_cluster_res
    clusters = await repo.get_clusters_by_device_ids([dev_id])
    assert clusters[dev_id] == "DC-Norte"


@pytest.mark.asyncio
async def test_edges_lifecycle(mock_session) -> None:
    """Valida listagem, busca, salvamento e exclusão de edges e verificação edge_exists_between."""
    repo = TopologyRepository(session=mock_session)
    org_id = uuid4()
    edge_id = uuid4()
    src_id = uuid4()
    tgt_id = uuid4()
    now = datetime.now(UTC)

    model = TopologyEdgeModel(
        id=edge_id,
        organization_id=org_id,
        source_node_id=src_id,
        target_node_id=tgt_id,
        link_type="fiber",
        bandwidth_gbps=10.0,
        port_src="eth0",
        port_dst="eth1",
        created_at=now,
        updated_at=now,
    )

    # 1. list_edges
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [model]
    mock_session.execute.return_value = mock_result

    edges = await repo.list_edges(org_id)
    assert len(edges) == 1
    assert edges[0].link_type == "fiber"

    # 2. get_edge
    mock_result.scalar_one_or_none.return_value = model
    edge = await repo.get_edge(edge_id, org_id)
    assert edge is not None
    assert edge.source_node_id == src_id

    # 3. save_edge
    domain_edge = TopologyEdge(
        id=edge_id,
        organization_id=org_id,
        source_node_id=src_id,
        target_node_id=tgt_id,
        link_type="ethernet",
    )
    saved = await repo.save_edge(domain_edge)
    assert saved.link_type == "ethernet"

    # 4. delete_edge
    mock_del_result = MagicMock()
    mock_del_result.rowcount = 1
    mock_session.execute.return_value = mock_del_result
    assert await repo.delete_edge(edge_id, org_id) is True

    # 5. edge_exists_between
    mock_exists = MagicMock()
    mock_exists.scalar_one_or_none.return_value = edge_id
    mock_session.execute.return_value = mock_exists
    assert await repo.edge_exists_between(org_id, src_id, tgt_id) is True
