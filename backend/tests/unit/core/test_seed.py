"""Testes unitários para o módulo de seed e idempotência da base de dados."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.iam.database.models import AuditLogModel, OrganizationModel, UserModel
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.password import password_hasher
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.network_topology.database.models import (
    TopologyEdgeModel,
    TopologyNodeModel,
)
from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.telemetry.database.models import MetricModel
from src.core.database.base_model import Base
from src.core.database.seed import DEMO_DEVICES, seed_all


@pytest.mark.asyncio
async def test_seed_all_creates_and_is_idempotent() -> None:
    """Valida que seed_all popula a base com sucesso e é 100% idempotente em múltiplas execuções."""
    # Banco SQLite assíncrono em memória
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    with patch("src.core.database.seed.get_session_factory", return_value=session_factory):
        # 1. Primeira execução: Carga inicial
        await seed_all()

        async with session_factory() as session:
            # Organizações multi-tenant
            orgs = (await session.execute(select(OrganizationModel))).scalars().all()
            assert len(orgs) == 4
            org_slugs = {org.slug for org in orgs}
            assert "infrawatch-lab" in org_slugs
            assert "banco-sol" in org_slugs
            assert "unitel-angola" in org_slugs
            assert "sonangol" in org_slugs

            # Usuários de múltiplos níveis RBAC
            users = (await session.execute(select(UserModel))).scalars().all()
            assert len(users) == 8
            roles = {u.role for u in users}
            assert UserRole.SUPER_ADMIN.value in roles
            assert UserRole.NOC_OPERATOR.value in roles
            assert UserRole.ORG_ADMIN.value in roles
            assert UserRole.CLIENT_VIEWER.value in roles

            admin_user = next((u for u in users if u.role == UserRole.SUPER_ADMIN.value), None)
            assert admin_user is not None
            assert admin_user.is_active is True
            assert admin_user.is_verified is True
            # Valida hash Argon2
            assert (
                password_hasher.verify(admin_user.hashed_password or "", "Ndonda#2026!Admin")
                is True
            )

            org_admin_user = next((u for u in users if u.role == UserRole.ORG_ADMIN.value), None)
            assert org_admin_user is not None
            assert org_admin_user.email == "gestor.ti@bancosol.ao"

            # Dispositivos
            devices = (await session.execute(select(DeviceModel))).scalars().all()
            assert len(devices) == len(DEMO_DEVICES)

            # Incidentes
            incidents = (await session.execute(select(IncidentModel))).scalars().all()
            assert len(incidents) == 6
            statuses = {inc.status for inc in incidents}
            assert "TRIGGERED" in statuses
            assert "ACKNOWLEDGED" in statuses
            assert "RESOLVED" in statuses

            # Janelas de manutenção
            windows = (await session.execute(select(MaintenanceWindowModel))).scalars().all()
            assert len(windows) == 6

            # Métricas
            metrics_count = (await session.execute(select(func.count(MetricModel.id)))).scalar_one()
            assert metrics_count > 0

            # Topologia
            nodes = (await session.execute(select(TopologyNodeModel))).scalars().all()
            assert len(nodes) == 4
            edges = (await session.execute(select(TopologyEdgeModel))).scalars().all()
            assert len(edges) == 3

            # Trilha de Auditoria
            audit_logs = (await session.execute(select(AuditLogModel))).scalars().all()
            assert len(audit_logs) == 5

        # 2. Segunda execução consecutiva: Validação de Idempotência estrita
        await seed_all()

        async with session_factory() as session:
            # Quantidades não devem duplicar
            orgs_after = (await session.execute(select(OrganizationModel))).scalars().all()
            assert len(orgs_after) == 4

            users_after = (await session.execute(select(UserModel))).scalars().all()
            assert len(users_after) == 8

            devices_after = (await session.execute(select(DeviceModel))).scalars().all()
            assert len(devices_after) == len(DEMO_DEVICES)

            incidents_after = (await session.execute(select(IncidentModel))).scalars().all()
            assert len(incidents_after) == 6

            windows_after = (await session.execute(select(MaintenanceWindowModel))).scalars().all()
            assert len(windows_after) == 6

            nodes_after = (await session.execute(select(TopologyNodeModel))).scalars().all()
            assert len(nodes_after) == 4

            edges_after = (await session.execute(select(TopologyEdgeModel))).scalars().all()
            assert len(edges_after) == 3

            audit_logs_after = (await session.execute(select(AuditLogModel))).scalars().all()
            assert len(audit_logs_after) == 5

            # As métricas sintéticas não devem duplicar
            metrics_count_after = (
                await session.execute(select(func.count(MetricModel.id)))
            ).scalar_one()
            assert metrics_count_after == metrics_count

    await engine.dispose()
