"""DTOs Pydantic de saída (Responses) para o contexto de Topologia."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.contexts.network_topology.domain.models import (
    TopologyEdge,
    TopologyGraph,
    TopologyNode,
)


class TopologyNodeResponse(BaseModel):
    """Representação serializada de um nó de topologia para o frontend."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    node_type: str
    organization_id: UUID
    device_id: UUID | None = None
    ip_address: str | None = None
    cluster: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    device_status: str | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(
        cls,
        node: TopologyNode,
        device_status: str | None = None,
    ) -> TopologyNodeResponse:
        """Instancia o DTO a partir da entidade de domínio pura enriquecida com o status."""
        return cls(
            id=node.id,
            label=node.label,
            node_type=node.node_type,
            organization_id=node.organization_id,
            device_id=node.device_id,
            ip_address=node.ip_address,
            cluster=node.cluster,
            position_x=node.position_x,
            position_y=node.position_y,
            device_status=device_status,
            created_at=node.created_at,
            updated_at=node.updated_at,
        )


class TopologyEdgeResponse(BaseModel):
    """Representação serializada de um enlace entre nós."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_node_id: UUID
    target_node_id: UUID
    organization_id: UUID
    link_type: str
    bandwidth_gbps: float | None = None
    port_src: str | None = None
    port_dst: str | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, edge: TopologyEdge) -> TopologyEdgeResponse:
        """Instancia o DTO a partir da entidade de domínio pura."""
        return cls(
            id=edge.id,
            source_node_id=edge.source_node_id,
            target_node_id=edge.target_node_id,
            organization_id=edge.organization_id,
            link_type=edge.link_type,
            bandwidth_gbps=edge.bandwidth_gbps,
            port_src=edge.port_src,
            port_dst=edge.port_dst,
            created_at=edge.created_at,
            updated_at=edge.updated_at,
        )


class TopologyGraphResponse(BaseModel):
    """Grafo canônico contendo todos os nós e enlaces da infraestrutura."""

    model_config = ConfigDict(from_attributes=True)

    nodes: list[TopologyNodeResponse]
    edges: list[TopologyEdgeResponse]
    total_nodes: int
    total_edges: int
    cluster: str | None = None

    @classmethod
    def from_domain(
        cls,
        graph: TopologyGraph,
        device_statuses: dict[UUID, str] | None = None,
    ) -> TopologyGraphResponse:
        """Monta a resposta completa a partir do agregador de domínio."""
        statuses = device_statuses or {}
        nodes_dto = [
            TopologyNodeResponse.from_domain(
                node,
                device_status=statuses.get(node.device_id) if node.device_id else None,
            )
            for node in graph.nodes
        ]
        edges_dto = [TopologyEdgeResponse.from_domain(edge) for edge in graph.edges]
        return cls(
            nodes=nodes_dto,
            edges=edges_dto,
            total_nodes=graph.total_nodes,
            total_edges=graph.total_edges,
            cluster=graph.dominant_cluster,
        )


class ProbeDispatchResponse(BaseModel):
    """Resposta imediata de aceite da solicitação de teste de ping."""

    probe_id: str
    node_id: str
    ip_address: str
    sse_channel: str
    message: str
