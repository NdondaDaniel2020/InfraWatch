"""Repositório de Topologia de Rede.

Adapter de persistência (Driven) que abstrai o acesso às tabelas
`topology_nodes` e `topology_edges` via SQLAlchemy 2.0 assíncrono.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.network.topology.database.models import TopologyEdgeModel, TopologyNodeModel
from src.contexts.network.topology.domain.models import (
    TopologyEdge,
    TopologyGraph,
    TopologyNode,
)


class TopologyRepository:
    """Repositório concreto para persistência e recuperação do grafo de topologia."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Grafo Completo
    # ------------------------------------------------------------------

    async def get_graph(self, organization_id: UUID) -> TopologyGraph:
        """Retorna o grafo completo (nós + enlaces) de uma organização."""
        nodes = await self.list_nodes(organization_id)
        edges = await self.list_edges(organization_id)
        return TopologyGraph(nodes=nodes, edges=edges)

    # ------------------------------------------------------------------
    # Nós (TopologyNode)
    # ------------------------------------------------------------------

    async def list_nodes(self, organization_id: UUID) -> list[TopologyNode]:
        """Lista todos os nós da organização."""
        stmt = (
            select(TopologyNodeModel)
            .where(TopologyNodeModel.organization_id == organization_id)
            .order_by(TopologyNodeModel.created_at)
        )
        result = await self._session.execute(stmt)
        return [self._node_to_domain(m) for m in result.scalars().all()]

    async def get_node(self, node_id: UUID, organization_id: UUID) -> TopologyNode | None:
        """Recupera um nó específico validando o escopo da organização."""
        stmt = select(TopologyNodeModel).where(
            TopologyNodeModel.id == node_id,
            TopologyNodeModel.organization_id == organization_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._node_to_domain(model) if model else None

    async def save_node(self, node: TopologyNode) -> TopologyNode:
        """Insere ou atualiza (upsert) um nó no banco."""
        stmt = select(TopologyNodeModel).where(TopologyNodeModel.id == node.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if model is None:
            model = TopologyNodeModel(id=node.id)
            self._session.add(model)

        model.organization_id = node.organization_id
        model.label = node.label
        model.node_type = node.node_type
        model.device_id = node.device_id
        model.ip_address = node.ip_address
        model.cluster = node.cluster
        model.position_x = node.position_x
        model.position_y = node.position_y

        await self._session.flush()
        return self._node_to_domain(model)

    async def delete_node(self, node_id: UUID, organization_id: UUID) -> bool:
        """Remove um nó e seus enlaces (CASCADE no banco). Retorna True se encontrado."""
        stmt = delete(TopologyNodeModel).where(
            TopologyNodeModel.id == node_id,
            TopologyNodeModel.organization_id == organization_id,
        )
        result = await self._session.execute(stmt)
        return result.rowcount > 0

    # ------------------------------------------------------------------
    # Enlaces (TopologyEdge)
    # ------------------------------------------------------------------

    async def list_edges(self, organization_id: UUID) -> list[TopologyEdge]:
        """Lista todos os enlaces da organização."""
        stmt = (
            select(TopologyEdgeModel)
            .where(TopologyEdgeModel.organization_id == organization_id)
            .order_by(TopologyEdgeModel.created_at)
        )
        result = await self._session.execute(stmt)
        return [self._edge_to_domain(m) for m in result.scalars().all()]

    async def get_edge(self, edge_id: UUID, organization_id: UUID) -> TopologyEdge | None:
        """Recupera um enlace específico validando o escopo da organização."""
        stmt = select(TopologyEdgeModel).where(
            TopologyEdgeModel.id == edge_id,
            TopologyEdgeModel.organization_id == organization_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._edge_to_domain(model) if model else None

    async def save_edge(self, edge: TopologyEdge) -> TopologyEdge:
        """Insere ou atualiza (upsert) um enlace no banco."""
        stmt = select(TopologyEdgeModel).where(TopologyEdgeModel.id == edge.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if model is None:
            model = TopologyEdgeModel(id=edge.id)
            self._session.add(model)

        model.organization_id = edge.organization_id
        model.source_node_id = edge.source_node_id
        model.target_node_id = edge.target_node_id
        model.link_type = edge.link_type
        model.bandwidth_gbps = edge.bandwidth_gbps
        model.port_src = edge.port_src
        model.port_dst = edge.port_dst

        await self._session.flush()
        return self._edge_to_domain(model)

    async def delete_edge(self, edge_id: UUID, organization_id: UUID) -> bool:
        """Remove um enlace. Retorna True se encontrado."""
        stmt = delete(TopologyEdgeModel).where(
            TopologyEdgeModel.id == edge_id,
            TopologyEdgeModel.organization_id == organization_id,
        )
        result = await self._session.execute(stmt)
        return result.rowcount > 0

    async def edge_exists_between(
        self, source_id: UUID, target_id: UUID, organization_id: UUID
    ) -> bool:
        """Verifica se já existe um enlace entre dois nós (em qualquer direção)."""
        stmt = select(TopologyEdgeModel.id).where(
            TopologyEdgeModel.organization_id == organization_id,
            (
                (TopologyEdgeModel.source_node_id == source_id)
                & (TopologyEdgeModel.target_node_id == target_id)
            )
            | (
                (TopologyEdgeModel.source_node_id == target_id)
                & (TopologyEdgeModel.target_node_id == source_id)
            ),
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none() is not None

    # ------------------------------------------------------------------
    # Mapeamento ORM → Domínio
    # ------------------------------------------------------------------

    @staticmethod
    def _node_to_domain(model: TopologyNodeModel) -> TopologyNode:
        return TopologyNode(
            id=model.id,
            label=model.label,
            node_type=model.node_type,
            organization_id=model.organization_id,
            device_id=model.device_id,
            ip_address=model.ip_address,
            cluster=model.cluster,
            position_x=model.position_x,
            position_y=model.position_y,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @staticmethod
    def _edge_to_domain(model: TopologyEdgeModel) -> TopologyEdge:
        return TopologyEdge(
            id=model.id,
            source_node_id=model.source_node_id,
            target_node_id=model.target_node_id,
            organization_id=model.organization_id,
            link_type=model.link_type,
            bandwidth_gbps=model.bandwidth_gbps,
            port_src=model.port_src,
            port_dst=model.port_dst,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
