"""Testes unitários das entidades de domínio de Topologia (TopologyNode, TopologyEdge, TopologyGraph)."""

from uuid import uuid4

import pytest

from src.contexts.network.topology.domain.models import (
    EdgeAlreadyExistsError,
    EdgeNotFoundError,
    InvalidLinkTypeError,
    InvalidNodeTypeError,
    NodeNotFoundError,
    SelfLoopEdgeError,
    TopologyDomainError,
    TopologyEdge,
    TopologyGraph,
    TopologyNode,
)


def test_topology_node_valid_creation():
    node_id = uuid4()
    org_id = uuid4()
    node = TopologyNode(
        id=node_id,
        label="SW-CORE-LUANDA-01",
        node_type="device",
        organization_id=org_id,
        ip_address="10.0.1.1",
        cluster="LUANDA-CORE",
        position_x=100.0,
        position_y=200.0,
    )
    assert node.id == node_id
    assert node.label == "SW-CORE-LUANDA-01"
    assert node.node_type == "device"
    assert node.can_probe() is True


def test_topology_node_empty_label_raises_error():
    with pytest.raises(TopologyDomainError, match="não pode ser vazio"):
        TopologyNode(
            id=uuid4(),
            label="   ",
            node_type="device",
            organization_id=uuid4(),
        )


def test_topology_node_invalid_type_raises_error():
    with pytest.raises(InvalidNodeTypeError, match="Tipo de nó inválido"):
        TopologyNode(
            id=uuid4(),
            label="Node-1",
            node_type="invalid_type",
            organization_id=uuid4(),
        )


def test_topology_node_position_and_label_updates():
    node = TopologyNode(
        id=uuid4(),
        label="Old-Name",
        node_type="service",
        organization_id=uuid4(),
    )
    node.update_position(350.5, 420.0)
    assert node.position_x == 350.5
    assert node.position_y == 420.0

    node.update_label("New-Name")
    assert node.label == "New-Name"

    with pytest.raises(TopologyDomainError):
        node.update_label("")


def test_topology_edge_valid_creation():
    src_id = uuid4()
    dst_id = uuid4()
    org_id = uuid4()
    edge = TopologyEdge(
        id=uuid4(),
        source_node_id=src_id,
        target_node_id=dst_id,
        organization_id=org_id,
        link_type="fiber",
        bandwidth_gbps=100.0,
        port_src="GE0/0/1",
        port_dst="GE0/0/2",
    )
    assert edge.source_node_id == src_id
    assert edge.target_node_id == dst_id
    assert edge.bandwidth_gbps == 100.0


def test_topology_edge_self_loop_raises_error():
    node_id = uuid4()
    with pytest.raises(SelfLoopEdgeError, match="não pode conectar-se a si mesmo"):
        TopologyEdge(
            id=uuid4(),
            source_node_id=node_id,
            target_node_id=node_id,
            organization_id=uuid4(),
        )


def test_topology_edge_invalid_link_type_raises_error():
    with pytest.raises(InvalidLinkTypeError):
        TopologyEdge(
            id=uuid4(),
            source_node_id=uuid4(),
            target_node_id=uuid4(),
            organization_id=uuid4(),
            link_type="satelite_invalido",
        )


def test_topology_edge_negative_bandwidth_raises_error():
    with pytest.raises(TopologyDomainError, match="deve ser positivo"):
        TopologyEdge(
            id=uuid4(),
            source_node_id=uuid4(),
            target_node_id=uuid4(),
            organization_id=uuid4(),
            bandwidth_gbps=-5.0,
        )


def test_topology_graph_properties():
    org_id = uuid4()
    n1 = TopologyNode(id=uuid4(), label="N1", node_type="device", organization_id=org_id, cluster="CLUSTER-A")
    n2 = TopologyNode(id=uuid4(), label="N2", node_type="device", organization_id=org_id, cluster="CLUSTER-A")
    n3 = TopologyNode(id=uuid4(), label="N3", node_type="service", organization_id=org_id, cluster="CLUSTER-B")

    edge = TopologyEdge(id=uuid4(), source_node_id=n1.id, target_node_id=n2.id, organization_id=org_id)

    graph = TopologyGraph(nodes=[n1, n2, n3], edges=[edge])
    assert graph.total_nodes == 3
    assert graph.total_edges == 1
    assert graph.dominant_cluster == "CLUSTER-A"


def test_topology_semantic_exceptions():
    node_id = uuid4()
    err_node = NodeNotFoundError(node_id)
    assert str(node_id) in str(err_node)

    edge_id = uuid4()
    err_edge = EdgeNotFoundError(edge_id)
    assert str(edge_id) in str(err_edge)

    src_id = uuid4()
    dst_id = uuid4()
    err_exists = EdgeAlreadyExistsError(src_id, dst_id)
    assert str(src_id) in str(err_exists)
