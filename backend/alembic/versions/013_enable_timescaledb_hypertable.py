"""enable_timescaledb_hypertable

Revision ID: 013_enable_timescaledb
Revises: 012_alter_devices_timestamps
Create Date: 2026-10-16 01:30:00.000000

Ativa a extensão TimescaleDB no PostgreSQL, converte a tabela ``metrics``
em Hypertable particionada no eixo temporal (timestamp) e configura
política de compressão colunar nativa para chunks com mais de 7 dias.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "013_enable_timescaledb"
down_revision: str | None = "012_alter_devices_timestamps"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_sqlite() -> bool:
    """Verifica se o dialect ativo é SQLite."""
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        # SQLite em ambiente de teste não possui TimescaleDB; no-op seguro
        return

    # No PostgreSQL, verifica se a extensão está disponível antes de executar
    op.execute("""
        DO $$
        DECLARE
            v_relkind "char";
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
                -- 1. Habilita a extensão TimescaleDB
                CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

                -- 2. Verifica se a tabela metrics foi criada como particionada nativa (relkind = 'p')
                SELECT relkind INTO v_relkind
                FROM pg_class
                WHERE relname = 'metrics' AND relnamespace = 'public'::regnamespace;

                IF v_relkind = 'p' THEN
                    -- Migra para tabela regular para permitir que o TimescaleDB assuma a gestão de chunks
                    CREATE TABLE IF NOT EXISTS metrics_timescale (
                        id BIGSERIAL NOT NULL,
                        device_id UUID NOT NULL,
                        organization_id UUID NOT NULL,
                        metric_type VARCHAR(50) NOT NULL,
                        value DOUBLE PRECISION NOT NULL,
                        packet_loss DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                        status VARCHAR(20) NOT NULL DEFAULT 'UP',
                        timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
                        PRIMARY KEY (id, timestamp)
                    );

                    INSERT INTO metrics_timescale SELECT * FROM metrics;

                    DROP TABLE metrics CASCADE;

                    ALTER TABLE metrics_timescale RENAME TO metrics;
                END IF;

                -- 3. Converte a tabela em Hypertable indexada pelo timestamp
                PERFORM create_hypertable(
                    'metrics',
                    'timestamp',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                );

                -- 4. Garante os índices essenciais de consulta de séries temporais
                CREATE INDEX IF NOT EXISTS ix_metrics_device_timestamp ON metrics (device_id, timestamp DESC);
                CREATE INDEX IF NOT EXISTS ix_metrics_org_timestamp ON metrics (organization_id, timestamp DESC);
                CREATE INDEX IF NOT EXISTS ix_metrics_metric_type ON metrics (metric_type, timestamp DESC);

                -- 5. Ativa compressão colunar nativa (Gorilla para floats e Delta-of-delta para tempo)
                ALTER TABLE metrics SET (
                    timescaledb.compress,
                    timescaledb.compress_segmentby = 'device_id, organization_id, metric_type',
                    timescaledb.compress_orderby = 'timestamp DESC'
                );

                -- 6. Adiciona política de compressão automática para dados com mais de 7 dias
                PERFORM add_compression_policy('metrics', INTERVAL '7 days', if_not_exists => TRUE);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    if _is_sqlite():
        return

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                -- Remove política de compressão se ativa
                PERFORM remove_compression_policy('metrics', if_exists => TRUE);

                -- Desativa compressão
                ALTER TABLE metrics SET (timescaledb.compress = false);
            END IF;
        END $$;
    """)
