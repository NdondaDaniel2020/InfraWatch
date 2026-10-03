"""create_partitioned_metrics_table

Revision ID: 009_create_partitioned_metrics
Revises: 008_create_devices
Create Date: 2026-10-03 14:00:00.000000

Cria a tabela pai ``metrics`` com PARTITION BY RANGE (timestamp)
e as partições iniciais para os meses correntes e seguinte.
"""
import calendar
from datetime import datetime, timezone

from alembic import op


# revision identifiers, used by Alembic.
revision = '009_create_partitioned_metrics'
down_revision = '008_create_devices'
branch_labels = None
depends_on = None


def _partition_name(year: int, month: int) -> str:
    return f"metrics_y{year}m{month:02d}"


def _next_month(year: int, month: int) -> tuple[int, int]:
    """Retorna (ano, mês) do mês seguinte."""
    if month == 12:
        return year + 1, 1
    return year, month + 1


def upgrade() -> None:
    # 1. Criar tabela pai particionada via SQL puro (SQLAlchemy não suporta PARTITION BY)
    op.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            id          BIGSERIAL       NOT NULL,
            device_id   UUID            NOT NULL,
            organization_id UUID        NOT NULL,
            metric_type VARCHAR(50)     NOT NULL,
            value       DOUBLE PRECISION NOT NULL,
            packet_loss DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            status      VARCHAR(20)     NOT NULL DEFAULT 'UP',
            timestamp   TIMESTAMPTZ     NOT NULL DEFAULT now(),
            PRIMARY KEY (id, timestamp)
        ) PARTITION BY RANGE (timestamp);
    """)

    # 2. Índices na tabela pai (propagam para partições filhas automaticamente)
    op.execute("CREATE INDEX IF NOT EXISTS ix_metrics_device_timestamp ON metrics (device_id, timestamp);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_metrics_org_timestamp ON metrics (organization_id, timestamp);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_metrics_metric_type ON metrics (metric_type, timestamp);")

    # 3. Criar partições para o mês corrente e o próximo
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    for _ in range(2):
        name = _partition_name(year, month)
        start = f"{year}-{month:02d}-01T00:00:00+00:00"
        ny, nm = _next_month(year, month)
        end = f"{ny}-{nm:02d}-01T00:00:00+00:00"
        op.execute(f"""
            CREATE TABLE IF NOT EXISTS {name} PARTITION OF metrics
            FOR VALUES FROM ('{start}') TO ('{end}');
        """)
        year, month = ny, nm

    # 4. Comentário na tabela
    op.execute("COMMENT ON TABLE metrics IS 'Séries temporais de telemetria particionadas por mês';")


def downgrade() -> None:
    # Remove partições e tabela pai (CASCADE remove partições automaticamente)
    op.execute("DROP TABLE IF EXISTS metrics CASCADE;")
