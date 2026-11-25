"""Testes unitários para validação das diretrizes de hardening do banco de dados (Checklist Produção).

Cobre:
- Ponto 2: statement_timeout e lock_timeout configurados nas conexões PostgreSQL
- Ponto 4: integridade garantida via CheckConstraints na camada de persistência
- Ponto 8: trilha de auditoria para ações de leitura de dados sensíveis
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.iam.database.models import OrganizationModel
from src.contexts.iam.domain.enums import AuditAction
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.config import Settings
from src.core.database.base_model import Base
from src.core.database.session import get_engine


def test_settings_database_timeouts_defaults():
    """Valida valores padrão seguros para statement_timeout e lock_timeout."""
    settings = Settings()
    assert settings.DB_STATEMENT_TIMEOUT_MS == 10000
    assert settings.DB_LOCK_TIMEOUT_MS == 5000


def test_postgres_engine_configures_timeouts():
    """Valida injeção de statement_timeout e lock_timeout em URLs PostgreSQL."""
    test_pg_url = "postgresql://user:pass@localhost:5432/testdb"
    with (
        patch("src.core.database.session.create_async_engine") as mock_create_engine,
        patch("src.core.database.session.get_settings") as mock_settings,
    ):
        mock_settings.return_value = Settings(
            DATABASE_URL=test_pg_url,
            DB_STATEMENT_TIMEOUT_MS=8000,
            DB_LOCK_TIMEOUT_MS=3000,
        )
        get_engine.cache_clear()
        get_engine()
        get_engine.cache_clear()

        assert mock_create_engine.called
        _, kwargs = mock_create_engine.call_args
        server_settings = kwargs.get("connect_args", {}).get("server_settings", {})
        assert server_settings.get("statement_timeout") == "8000"
        assert server_settings.get("lock_timeout") == "3000"


def test_audit_action_contains_read_and_credential_actions():
    """Valida presença das novas ações de auditoria para leitura de relatórios e credenciais."""
    assert "SLA_REPORT_DOWNLOADED" in AuditAction.__members__
    assert "CREDENTIAL_ACCESSED" in AuditAction.__members__
    assert AuditAction.SLA_REPORT_DOWNLOADED == "SLA_REPORT_DOWNLOADED"
    assert AuditAction.CREDENTIAL_ACCESSED == "CREDENTIAL_ACCESSED"


@pytest.fixture
async def memory_db_session():
    """Cria banco SQLite em memória com verificação de constraints ativada."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_constraint_metric_packet_loss_invalid_high(memory_db_session: AsyncSession):
    """Garante que packet_loss > 100.0 seja rejeitado pelo banco de dados."""
    metric = MetricModel(
        device_id=uuid4(),
        organization_id=uuid4(),
        metric_type="packet_loss",
        value=105.0,
        packet_loss=105.0,
        status="DEGRADED",
        timestamp=datetime.now(UTC),
    )
    memory_db_session.add(metric)
    with pytest.raises(IntegrityError):
        await memory_db_session.commit()
    await memory_db_session.rollback()


@pytest.mark.asyncio
async def test_constraint_metric_packet_loss_invalid_negative(memory_db_session: AsyncSession):
    """Garante que packet_loss < 0.0 seja rejeitado pelo banco de dados."""
    metric = MetricModel(
        device_id=uuid4(),
        organization_id=uuid4(),
        metric_type="packet_loss",
        value=-1.0,
        packet_loss=-1.0,
        status="UP",
        timestamp=datetime.now(UTC),
    )
    memory_db_session.add(metric)
    with pytest.raises(IntegrityError):
        await memory_db_session.commit()
    await memory_db_session.rollback()


@pytest.mark.asyncio
async def test_constraint_device_interval_seconds_too_low(memory_db_session: AsyncSession):
    """Garante que interval_seconds < 5 seja rejeitado pelo banco de dados."""
    device = DeviceModel(
        id=uuid4(),
        organization_id=uuid4(),
        name="Switch Edge",
        ip_address="192.168.1.1",
        port=161,
        protocol="SNMP",
        category="NETWORK",
        interval_seconds=2,  # Viola a constraint (minimo 5s)
    )
    memory_db_session.add(device)
    with pytest.raises(IntegrityError):
        await memory_db_session.commit()
    await memory_db_session.rollback()


@pytest.mark.asyncio
async def test_constraint_maintenance_window_inverted(memory_db_session: AsyncSession):
    """Garante que end_time < start_time seja rejeitado pelo banco de dados."""
    now = datetime.now(UTC)
    window = MaintenanceWindowModel(
        id=uuid4(),
        device_id=uuid4(),
        organization_id=uuid4(),
        start_time=now,
        end_time=now - timedelta(hours=2),  # Viola constraint
        is_approved=True,
        description="Janela com horario invertido",
    )
    memory_db_session.add(window)
    with pytest.raises(IntegrityError):
        await memory_db_session.commit()
    await memory_db_session.rollback()


@pytest.mark.asyncio
async def test_constraint_incident_dates_incoherent(memory_db_session: AsyncSession):
    """Garante que resolved_at < started_at seja rejeitado pelo banco de dados."""
    now = datetime.now(UTC)
    incident = IncidentModel(
        id=uuid4(),
        device_id=uuid4(),
        title="Incidente temporalmente inconsistente",
        started_at=now,
        resolved_at=now - timedelta(minutes=30),  # Viola constraint
    )
    memory_db_session.add(incident)
    with pytest.raises(IntegrityError):
        await memory_db_session.commit()
    await memory_db_session.rollback()


@pytest.mark.asyncio
async def test_constraint_organization_sla_target_out_of_range(memory_db_session: AsyncSession):
    """Garante que sla_target_default fora de [50.00, 100.00] seja rejeitado pelo banco."""
    org = OrganizationModel(
        id=uuid4(),
        name="Org Invalida",
        slug="org-invalida",
        sla_target_default=Decimal("120.00"),  # Viola constraint
    )
    memory_db_session.add(org)
    with pytest.raises(IntegrityError):
        await memory_db_session.commit()
    await memory_db_session.rollback()
