"""Testes de integridade e conformidade das migrações Alembic.

Valida que:
1. O pipeline de migrações (001 a 006) roda com sucesso até o HEAD.
2. Todas as tabelas esperadas pelo modelo de domínio são criadas com sucesso.
3. Todas as colunas esperadas (incluindo is_verified, mfa_enabled, mfa_type, device_name) existem.
4. O processo de downgrade roda sem quebras.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from src.core.config import get_settings


@pytest.fixture
def alembic_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Config, str]:
    """Prepara configuração do Alembic apontando para um SQLite em arquivo temporário."""
    db_file = tmp_path / "test_migrations.db"
    db_url = f"sqlite+aiosqlite:///{db_file}"

    # Sobrescreve DATABASE_URL nas variáveis de ambiente e no cache do Settings
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()

    backend_dir = Path(__file__).resolve().parents[2]
    alembic_ini_path = backend_dir / "alembic.ini"

    cfg = Config(str(alembic_ini_path))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)

    yield cfg, db_url

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_alembic_migrations_upgrade_and_downgrade(alembic_config: tuple[Config, str]) -> None:
    cfg, db_url = alembic_config

    # 1. Executa upgrade até o HEAD em thread separada para não colidir com o event loop do pytest
    await asyncio.to_thread(command.upgrade, cfg, "head")

    # 2. Inspeciona o schema gerado
    engine = create_async_engine(db_url)
    async with engine.connect() as conn:
        def _inspect(sync_conn):
            inspector = inspect(sync_conn)
            tables = set(inspector.get_table_names())

            # Tabelas essenciais que devem existir
            expected_tables = {
                "outbox_events",
                "organizations",
                "users",
                "refresh_tokens",
                "audit_logs",
                "notifications",
                "password_reset_tokens",
                "email_verification_tokens",
                "mfa_methods",
            }
            assert expected_tables.issubset(tables), f"Faltam tabelas: {expected_tables - tables}"

            # Valida colunas em users
            user_cols = {col["name"] for col in inspector.get_columns("users")}
            assert {"is_verified", "mfa_enabled", "mfa_type", "oauth_provider", "google_id"}.issubset(user_cols)

            # Valida colunas em refresh_tokens
            refresh_cols = {col["name"] for col in inspector.get_columns("refresh_tokens")}
            assert {"device_name", "revoked_at"}.issubset(refresh_cols)

        await conn.run_sync(_inspect)

    # 3. Executa downgrade até a base para validar reversibilidade
    await asyncio.to_thread(command.downgrade, cfg, "base")

    async with engine.connect() as conn:
        def _inspect_empty(sync_conn):
            inspector = inspect(sync_conn)
            tables = set(inspector.get_table_names())
            assert "users" not in tables
            assert "mfa_methods" not in tables
            assert "password_reset_tokens" not in tables

        await conn.run_sync(_inspect_empty)

    # 4. Re-executa upgrade até HEAD
    await asyncio.to_thread(command.upgrade, cfg, "head")

    await engine.dispose()
