"""Modelos SQLAlchemy 2.0 — Topologia de Rede.

Define as tabelas `topology_nodes` e `topology_edges` com FK soft
para `devices` (SET NULL ao remover o dispositivo referenciado).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database.base_model import Base


class TopologyNodeModel(Base):
    """Representação persistida de um nó do grafo de infraestrutura."""

    __tablename__ = "topology_nodes"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(index=True)

    label: Mapped[str] = mapped_column(String(255))
    node_type: Mapped[str] = mapped_column(String(50))  # device | service | external | cluster

    # Referência soft ao inventário — SET NULL ao excluir o dispositivo
    device_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    cluster: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Coordenadas para layout fixo no canvas do frontend
    position_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TopologyEdgeModel(Base):
    """Representação persistida de um enlace entre dois nós do grafo."""

    __tablename__ = "topology_edges"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(index=True)

    source_node_id: Mapped[UUID] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="CASCADE"),
        index=True,
    )
    target_node_id: Mapped[UUID] = mapped_column(
        ForeignKey("topology_nodes.id", ondelete="CASCADE"),
        index=True,
    )

    link_type: Mapped[str] = mapped_column(
        String(50), default="ethernet"
    )  # fiber | ethernet | vpn | logical | wireless
    bandwidth_gbps: Mapped[float | None] = mapped_column(Float, nullable=True)
    port_src: Mapped[str | None] = mapped_column(String(50), nullable=True)
    port_dst: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        # Impede links duplicados entre o mesmo par de nós
        UniqueConstraint("source_node_id", "target_node_id", name="uq_topology_edge_pair"),
    )
