"""Testes unitários para route handlers de Topologia de Rede."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.network_topology.api.routes.topology import (
    create_node,
    delete_node,
    get_available_devices,
    get_topology_graph,
    update_node_position,
)
from src.contexts.network_topology.domain.models import (
    NodeNotFoundError,
    TopologyDomainError,
    TopologyGraph,
    TopologyNode,
)
from src.contexts.network_topology.schemas.requests import (
    CreateTopologyNodeRequest,
    UpdateTopologyNodePositionRequest,
)


@pytest.fixture
def current_user():
    org_id = str(uuid4())
    return AuthenticatedUser(
        id=str(uuid4()),
        email="topo-operator@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
        organization_id=org_id,
    )


@pytest.mark.asyncio
async def test_get_topology_graph_and_available_devices(current_user) -> None:
    """Valida consulta do grafo completo e listagem de dispositivos disponíveis."""
    mock_service = AsyncMock()
    org_id = UUID(current_user.organization_id)

    node = TopologyNode(id=uuid4(), organization_id=org_id, label="R1", node_type="router")
    graph = TopologyGraph(nodes=[node], edges=[])
    mock_service.get_graph.return_value = (graph, {})

    # 1. get_topology_graph
    res = await get_topology_graph(user=current_user, service=mock_service)
    assert len(res.nodes) == 1
    assert res.nodes[0].label == "R1"

    # 2. get_available_devices
    mock_service.get_available_devices.return_value = [
        {
            "id": uuid4(),
            "name": "Switch DMZ",
            "ip_address": "192.168.1.5",
            "category": "SWITCH",
            "status": "ONLINE",
            "is_in_topology": False,
        }
    ]
    devs = await get_available_devices(user=current_user, service=mock_service)
    assert len(devs) == 1
    assert devs[0].name == "Switch DMZ"


@pytest.mark.asyncio
async def test_nodes_handlers_create_update_delete(current_user) -> None:
    """Valida cadastro, atualização de coordenadas e remoção de nó."""
    mock_service = AsyncMock()
    org_id = UUID(current_user.organization_id)
    node_id = uuid4()

    node = TopologyNode(
        id=node_id,
        organization_id=org_id,
        label="SW-Core",
        node_type="switch",
        position_x=10.0,
        position_y=20.0,
    )
    mock_service.create_node.return_value = node

    # 1. create_node sucesso
    create_req = CreateTopologyNodeRequest(label="SW-Core", node_type="switch")
    created = await create_node(payload=create_req, user=current_user, service=mock_service)
    assert created.label == "SW-Core"

    # 2. create_node erro de domínio (400)
    mock_service.create_node.side_effect = TopologyDomainError("Label inválido")
    with pytest.raises(HTTPException) as exc_400:
        await create_node(payload=create_req, user=current_user, service=mock_service)
    assert exc_400.value.status_code == 400

    # 3. update_node_position
    mock_service.update_node_position.return_value = node
    pos_req = UpdateTopologyNodePositionRequest(position_x=100.0, position_y=200.0)
    updated = await update_node_position(
        node_id=node_id, payload=pos_req, user=current_user, service=mock_service
    )
    assert updated.id == node_id

    # 4. update_node_position nó não encontrado (404)
    mock_service.update_node_position.side_effect = NodeNotFoundError("Node not found")
    with pytest.raises(HTTPException) as exc_404:
        await update_node_position(
            node_id=node_id, payload=pos_req, user=current_user, service=mock_service
        )
    assert exc_404.value.status_code == 404

    # 5. delete_node
    mock_service.delete_node.return_value = True
    await delete_node(node_id=node_id, user=current_user, service=mock_service)


@pytest.mark.asyncio
async def test_edges_handlers_create_update_delete(current_user) -> None:
    """Valida cadastro, atualização e remoção de enlaces (edges) na topologia."""
    from src.contexts.network_topology.api.routes.topology import (
        create_edge,
        delete_edge,
        update_edge,
    )
    from src.contexts.network_topology.domain.models import (
        EdgeAlreadyExistsError,
        EdgeNotFoundError,
        TopologyEdge,
    )
    from src.contexts.network_topology.schemas.requests import (
        CreateTopologyEdgeRequest,
        UpdateTopologyEdgeRequest,
    )

    mock_service = AsyncMock()
    org_id = UUID(current_user.organization_id)
    edge_id = uuid4()
    src_id = uuid4()
    dst_id = uuid4()

    edge = TopologyEdge(
        id=edge_id,
        source_node_id=src_id,
        target_node_id=dst_id,
        organization_id=org_id,
        link_type="fiber",
        bandwidth_gbps=10.0,
        port_src="Eth1/1",
        port_dst="Eth1/2",
    )
    mock_service.create_edge.return_value = edge
    mock_service.update_edge.return_value = edge

    # 1. create_edge sucesso
    c_req = CreateTopologyEdgeRequest(
        source_node_id=src_id,
        target_node_id=dst_id,
        link_type="fiber",
        bandwidth_gbps=10.0,
        port_src="Eth1/1",
        port_dst="Eth1/2",
    )
    created = await create_edge(payload=c_req, user=current_user, service=mock_service)
    assert created.id == edge_id

    # create_edge já existente (409)
    mock_service.create_edge.side_effect = EdgeAlreadyExistsError(src_id, dst_id)
    with pytest.raises(HTTPException) as exc_409:
        await create_edge(payload=c_req, user=current_user, service=mock_service)
    assert exc_409.value.status_code == 409

    # 2. update_edge sucesso e 404
    u_req = UpdateTopologyEdgeRequest(bandwidth_gbps=20.0)
    mock_service.update_edge.side_effect = None
    updated = await update_edge(
        edge_id=edge_id, payload=u_req, user=current_user, service=mock_service
    )
    assert updated.id == edge_id

    mock_service.update_edge.side_effect = EdgeNotFoundError(edge_id)
    with pytest.raises(HTTPException) as exc_404:
        await update_edge(edge_id=edge_id, payload=u_req, user=current_user, service=mock_service)
    assert exc_404.value.status_code == 404

    # 3. delete_edge sucesso e 404
    mock_service.delete_edge.side_effect = None
    await delete_edge(edge_id=edge_id, user=current_user, service=mock_service)

    mock_service.delete_edge.side_effect = EdgeNotFoundError(edge_id)
    with pytest.raises(HTTPException) as exc_del_404:
        await delete_edge(edge_id=edge_id, user=current_user, service=mock_service)
    assert exc_del_404.value.status_code == 404


@pytest.mark.asyncio
async def test_probe_and_isolate_handlers(current_user) -> None:
    """Valida disparo de sonda on-demand e isolamento de nó."""
    from src.contexts.network_topology.api.routes.topology import (
        isolate_node,
        trigger_ondemand_probe,
    )
    from src.contexts.network_topology.domain.models import (
        MissingIpAddressError,
    )
    from src.contexts.network_topology.schemas.requests import TriggerOnDemandProbeRequest

    mock_service = AsyncMock()
    node_id = uuid4()

    # 1. trigger_ondemand_probe sucesso
    mock_service.dispatch_ondemand_probe.return_value = (
        "probe-uuid",
        "10.0.0.1",
        "topology:probe:10.0.0.1",
    )
    req = TriggerOnDemandProbeRequest(timeout_ms=3000)
    probe_res = await trigger_ondemand_probe(
        node_id=node_id, user=current_user, service=mock_service, payload=req
    )
    assert probe_res.probe_id == "probe-uuid"
    assert probe_res.ip_address == "10.0.0.1"

    # Falha: IP ausente
    mock_service.dispatch_ondemand_probe.side_effect = MissingIpAddressError()
    with pytest.raises(HTTPException) as exc_ip:
        await trigger_ondemand_probe(
            node_id=node_id, user=current_user, service=mock_service, payload=req
        )
    assert exc_ip.value.status_code == 400

    # 2. isolate_node sucesso
    mock_service.isolate_node.side_effect = None
    mock_service.isolate_node.return_value = "Nó isolado com sucesso."
    iso_res = await isolate_node(node_id=node_id, user=current_user, service=mock_service)
    assert iso_res.node_id == str(node_id)
