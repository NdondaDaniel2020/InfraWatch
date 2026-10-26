"""feat(topology): criar tabelas topology_nodes e topology_edges

Revision ID: 014_create_topology_tables
Revises: 013_enable_timescaledb_hypertable
Create Date: 2026-10-26 14:35:00.000000

Cria as tabelas de topologia de rede:
  - topology_nodes: nós do grafo (dispositivos, serviços, externos, clusters)
  - topology_edges: enlaces entre pares de nós com metadados do link
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "014_create_topology_tables"
down_revision = "013_enable_timescaledb_hypertable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # topology_nodes
    # ------------------------------------------------------------------
    op.create_table(
        "topology_nodes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("node_type", sa.String(50), nullable=False),
        sa.Column(
            "device_id",
            sa.UUID(),
            sa.ForeignKey("devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("cluster", sa.String(255), nullable=True),
        sa.Column("position_x", sa.Float(), nullable=True),
        sa.Column("position_y", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_topology_nodes_organization_id", "topology_nodes", ["organization_id"])
    op.create_index("ix_topology_nodes_device_id", "topology_nodes", ["device_id"])
    op.create_index("ix_topology_nodes_cluster", "topology_nodes", ["cluster"])

    # ------------------------------------------------------------------
    # topology_edges
    # ------------------------------------------------------------------
    op.create_table(
        "topology_edges",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column(
            "source_node_id",
            sa.UUID(),
            sa.ForeignKey("topology_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_node_id",
            sa.UUID(),
            sa.ForeignKey("topology_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("link_type", sa.String(50), nullable=False, server_default="ethernet"),
        sa.Column("bandwidth_gbps", sa.Float(), nullable=True),
        sa.Column("port_src", sa.String(50), nullable=True),
        sa.Column("port_dst", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_node_id", "target_node_id", name="uq_topology_edge_pair"),
    )
    op.create_index("ix_topology_edges_organization_id", "topology_edges", ["organization_id"])
    op.create_index("ix_topology_edges_source_node_id", "topology_edges", ["source_node_id"])
    op.create_index("ix_topology_edges_target_node_id", "topology_edges", ["target_node_id"])


def downgrade() -> None:
    op.drop_table("topology_edges")
    op.drop_table("topology_nodes")
