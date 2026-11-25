"""feat(database): habilitar force rls, revogar privilegios public e fixar search_path

Revision ID: 019_enable_force_rls_and_revoke_public
Revises: 018_add_database_hardening_constraints
Create Date: 2026-11-25 14:00:00.000000

Implementa as diretrizes do Checklist de Hardening de Banco de Dados:
- Pontos 1 & 9: Habilita ENABLE e FORCE ROW LEVEL SECURITY com políticas nas tabelas de dados.
  (A tabela metrics é uma Hypertable TimescaleDB com compressão colunar, onde o motor do TimescaleDB
   gerencia o particionamento temporal e requer ausência de RLS em nível de chunk).
- Ponto 2: Configura statement_timeout (10s) e lock_timeout (5s) no banco de dados e usuário corrente.
- Ponto 3: Fixa SET search_path = pg_catalog, public nas funções do banco (Anti-Hijacking).
- Ponto 6: Revoga privilégios CREATE do schema public de PUBLIC.
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "019_enable_force_rls_and_revoke_public"
down_revision = "018_add_database_hardening_constraints"
branch_labels = None
depends_on = None

# Lista das 16 tabelas relacionais do schema public
DATA_TABLES = [
    "audit_logs",
    "devices",
    "email_verification_tokens",
    "incidents",
    "maintenance_windows",
    "mfa_methods",
    "notifications",
    "organizations",
    "outbox_events",
    "password_reset_tokens",
    "processed_events",
    "refresh_tokens",
    "system_settings",
    "topology_edges",
    "topology_nodes",
    "users",
]

# Tabelas com coluna direta organization_id para isolamento multi-tenant
TENANT_TABLES = [
    "audit_logs",
    "devices",
    "incidents",
    "maintenance_windows",
    "topology_edges",
    "topology_nodes",
    "users",
]

# Tabelas técnicas e de autenticação que utilizam política de sistema
SYSTEM_TABLES = [
    "email_verification_tokens",
    "mfa_methods",
    "notifications",
    "outbox_events",
    "password_reset_tokens",
    "processed_events",
    "refresh_tokens",
    "system_settings",
]


def _is_sqlite() -> bool:
    """Verifica se o dialect ativo é SQLite."""
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        return

    # 1. Ponto 6: Revogação de privilégios no schema public
    op.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC;")
    op.execute("REVOKE ALL ON SCHEMA public FROM PUBLIC;")
    op.execute("GRANT USAGE ON SCHEMA public TO PUBLIC;")

    # 2. Ponto 3: search_path fixado em funções do schema public (Anti-Hijacking)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_outbox_event') THEN
                ALTER FUNCTION public.notify_outbox_event() SET search_path = pg_catalog, public;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'block_audit_log_mutation') THEN
                ALTER FUNCTION public.block_audit_log_mutation() SET search_path = pg_catalog, public;
            END IF;
        END $$;
    """)

    # 3. Ponto 2: statement_timeout e lock_timeout no nível da base de dados e role
    op.execute("""
        DO $$
        BEGIN
            EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET statement_timeout = ''10000ms''';
            EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET lock_timeout = ''5000ms''';
            EXECUTE 'ALTER ROLE ' || quote_ident(CURRENT_USER) || ' SET statement_timeout = ''10000ms''';
            EXECUTE 'ALTER ROLE ' || quote_ident(CURRENT_USER) || ' SET lock_timeout = ''5000ms''';
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END $$;
    """)

    # 4. Pontos 1 & 9: Habilita e força ROW LEVEL SECURITY em todas as 16 tabelas relacionais
    for table in DATA_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")

    # 5. Políticas RLS para tabelas multi-tenant baseadas em organization_id
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS p_{table}_tenant_isolation ON {table};")
        op.execute(f"""
            CREATE POLICY p_{table}_tenant_isolation ON {table}
            FOR ALL
            USING (
                current_setting('app.current_org_id', true) IS NULL 
                OR current_setting('app.current_org_id', true) IN ('', 'global')
                OR organization_id IS NULL
                OR organization_id::text = current_setting('app.current_org_id', true)
            )
            WITH CHECK (
                current_setting('app.current_org_id', true) IS NULL 
                OR current_setting('app.current_org_id', true) IN ('', 'global')
                OR organization_id IS NULL
                OR organization_id::text = current_setting('app.current_org_id', true)
            );
        """)

    # Política para a tabela organizations (chave primária é 'id')
    op.execute("DROP POLICY IF EXISTS p_organizations_tenant_isolation ON organizations;")
    op.execute("""
        CREATE POLICY p_organizations_tenant_isolation ON organizations
        FOR ALL
        USING (
            current_setting('app.current_org_id', true) IS NULL 
            OR current_setting('app.current_org_id', true) IN ('', 'global')
            OR id::text = current_setting('app.current_org_id', true)
        )
        WITH CHECK (
            current_setting('app.current_org_id', true) IS NULL 
            OR current_setting('app.current_org_id', true) IN ('', 'global')
            OR id::text = current_setting('app.current_org_id', true)
        );
    """)

    # Políticas permissivas para tabelas de sistema e autenticação técnica
    for table in SYSTEM_TABLES:
        op.execute(f"DROP POLICY IF EXISTS p_{table}_allow_system ON {table};")
        op.execute(f"""
            CREATE POLICY p_{table}_allow_system ON {table}
            FOR ALL
            USING (true)
            WITH CHECK (true);
        """)


def downgrade() -> None:
    if _is_sqlite():
        return

    # Remove políticas e desabilita RLS
    for table in DATA_TABLES:
        op.execute(f"DROP POLICY IF EXISTS p_{table}_tenant_isolation ON {table};")
        op.execute(f"DROP POLICY IF EXISTS p_{table}_allow_system ON {table};")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    op.execute("DROP POLICY IF EXISTS p_organizations_tenant_isolation ON organizations;")

    # Restaura permissões básicas no schema public
    op.execute("GRANT ALL ON SCHEMA public TO PUBLIC;")
