"""Add outbox notify trigger.

Revision ID: 007_add_outbox_notify_trigger
Revises: 006_create_mfa_and_token_tables
Create Date: 2026-10-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007_add_outbox_notify_trigger'
down_revision = '006_create_mfa_and_token_tables'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION notify_outbox_event() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_notify('outbox_events_wake', '');
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_outbox_notify
        AFTER INSERT ON outbox_events
        FOR EACH ROW EXECUTE FUNCTION notify_outbox_event();
    """)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_outbox_notify ON outbox_events;")
    op.execute("DROP FUNCTION IF EXISTS notify_outbox_event();")
