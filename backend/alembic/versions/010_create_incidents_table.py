"""create_incidents_table

Revision ID: 010_create_incidents
Revises: 009_create_partitioned_metrics
Create Date: 2026-10-10 01:20:00.000000

Cria a tabela de incidentes operacionais da plataforma (incidents)
com chaves estrangeiras para devices e users, e índices por status e data.
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = '010_create_incidents'
down_revision = '009_create_partitioned_metrics'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'incidents',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=True),
        sa.Column('operator_id', sa.Uuid(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('severity', sa.String(length=50), server_default='CRITICAL', nullable=False),
        sa.Column('status', sa.String(length=50), server_default='TRIGGERED', nullable=False),
        sa.Column('glpi_ticket_id', sa.Integer(), nullable=True),
        sa.Column('root_cause', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('downtime_minutes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], name=op.f('fk_incidents_device_id_devices'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_incidents_organization_id_organizations'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['operator_id'], ['users.id'], name=op.f('fk_incidents_operator_id_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_incidents')),
    )
    op.create_index(op.f('ix_incidents_device_id'), 'incidents', ['device_id'], unique=False)
    op.create_index(op.f('ix_incidents_organization_id'), 'incidents', ['organization_id'], unique=False)
    op.create_index(op.f('ix_incidents_operator_id'), 'incidents', ['operator_id'], unique=False)
    op.create_index(op.f('ix_incidents_status'), 'incidents', ['status'], unique=False)
    op.create_index(op.f('ix_incidents_started_at'), 'incidents', ['started_at'], unique=False)
    op.create_index(op.f('ix_incidents_glpi_ticket_id'), 'incidents', ['glpi_ticket_id'], unique=False)
    op.create_index('ix_incidents_status_started_at', 'incidents', ['status', 'started_at'], unique=False)
    op.create_index('ix_incidents_device_status', 'incidents', ['device_id', 'status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_incidents_device_status', table_name='incidents')
    op.drop_index('ix_incidents_status_started_at', table_name='incidents')
    op.drop_index(op.f('ix_incidents_glpi_ticket_id'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_started_at'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_status'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_operator_id'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_organization_id'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_device_id'), table_name='incidents')
    op.drop_table('incidents')
