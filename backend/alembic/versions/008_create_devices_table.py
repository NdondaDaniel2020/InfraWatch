"""create_devices_table

Revision ID: 008_create_devices
Revises: 007_add_outbox_notify_trigger
Create Date: 2026-10-03 02:56:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '008_create_devices'
down_revision = '007_add_outbox_notify_trigger'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'devices',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('hostname', sa.String(length=255), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=False),
        sa.Column('port', sa.Integer(), nullable=False),
        sa.Column('protocol', sa.String(length=50), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('interval_seconds', sa.Integer(), nullable=False),
        sa.Column('thresholds', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('is_paused', sa.Boolean(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('maintenance_until', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('search_vector', postgresql.TSVECTOR(), sa.Computed("to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(ip_address, '') || ' ' || coalesce(hostname, ''))", persisted=True), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_devices'))
    )
    op.create_index(op.f('ix_devices_organization_id'), 'devices', ['organization_id'], unique=False)
    op.create_index('ix_devices_search_vector', 'devices', ['search_vector'], unique=False, postgresql_using='gin')


def downgrade() -> None:
    op.drop_index('ix_devices_search_vector', table_name='devices', postgresql_using='gin')
    op.drop_index(op.f('ix_devices_organization_id'), table_name='devices')
    op.drop_table('devices')
