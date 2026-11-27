"""feat(database): criar views sanitizadas e role infrawatch_readonly (Hardening Ponto 5)

Revision ID: 020_create_sanitized_views_and_readonly_role
Revises: 019_enable_force_rls_and_revoke_public
Create Date: 2026-11-27 18:25:00.000000

Implementa a diretriz do Ponto 5 do Checklist de Hardening de Banco de Dados:
- Criação da role infrawatch_readonly para consultas de apenas-leitura (BI, reporting, auditoria).
- Criação da VIEW v_users_safe com mascaramento de e-mails (jo***@empresa.ao) e exclusão
  estrita de hashed_password e google_id.
- Criação da VIEW v_system_settings_masked com mascaramento de valores com is_secret = true.
- Ativação de security_barrier = true nas views para proteção contra vazamento por canal lateral.
- Concessão estrita de SELECT nas views sanitizadas e tabelas operacionais, revogando acesso
  direto às tabelas base sensíveis (users e system_settings).
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "020_create_sanitized_views_and_readonly_role"
down_revision = "019_enable_force_rls_and_revoke_public"
branch_labels = None
depends_on = None

READONLY_OPERATIONAL_TABLES = [
    "devices",
    "metrics",
    "incidents",
    "maintenance_windows",
    "organizations",
    "topology_nodes",
    "topology_edges",
]


def _is_sqlite() -> bool:
    """Verifica se o dialect ativo é SQLite."""
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        return

    # 1. Criação idempotente da role infrawatch_readonly
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'infrawatch_readonly') THEN
                CREATE ROLE infrawatch_readonly NOLOGIN;
            END IF;
        END $$;
    """)

    # 2. Criação da VIEW v_users_safe com security_barrier
    op.execute("""
        CREATE OR REPLACE VIEW public.v_users_safe WITH (security_barrier = true) AS
        SELECT
            id,
            organization_id,
            CASE 
                WHEN position('@' IN email) > 2 THEN 
                    substr(email, 1, 2) || '***@' || split_part(email, '@', 2)
                WHEN position('@' IN email) = 2 THEN 
                    substr(email, 1, 1) || '***@' || split_part(email, '@', 2)
                ELSE 
                    '***@' || split_part(email, '@', 2)
            END AS email,
            full_name,
            role,
            is_active,
            is_verified,
            oauth_provider,
            mfa_enabled,
            mfa_type,
            created_at,
            updated_at
        FROM public.users;
    """)

    # 3. Criação da VIEW v_system_settings_masked com security_barrier
    op.execute("""
        CREATE OR REPLACE VIEW public.v_system_settings_masked WITH (security_barrier = true) AS
        SELECT
            key,
            category,
            CASE 
                WHEN is_secret = true THEN '••••••••'
                ELSE value
            END AS value,
            is_secret,
            updated_at,
            updated_by
        FROM public.system_settings;
    """)

    # 4. Concessão de permissões estritas para infrawatch_readonly
    op.execute("GRANT USAGE ON SCHEMA public TO infrawatch_readonly;")
    op.execute("GRANT SELECT ON public.v_users_safe TO infrawatch_readonly;")
    op.execute("GRANT SELECT ON public.v_system_settings_masked TO infrawatch_readonly;")

    # Tabelas operacionais não-sensíveis para relatórios e BI
    for tbl in READONLY_OPERATIONAL_TABLES:
        op.execute(f"GRANT SELECT ON public.{tbl} TO infrawatch_readonly;")

    # Bloqueio explícito de acesso direto às tabelas brutas sensíveis
    op.execute("REVOKE SELECT ON public.users FROM infrawatch_readonly;")
    op.execute("REVOKE SELECT ON public.system_settings FROM infrawatch_readonly;")


def downgrade() -> None:
    if _is_sqlite():
        return

    # 1. Drop das views sanitizadas
    op.execute("DROP VIEW IF EXISTS public.v_system_settings_masked;")
    op.execute("DROP VIEW IF EXISTS public.v_users_safe;")

    # 2. Revogação de privilégios e exclusão da role infrawatch_readonly
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'infrawatch_readonly') THEN
                DROP OWNED BY infrawatch_readonly CASCADE;
                DROP ROLE infrawatch_readonly;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END $$;
    """)
