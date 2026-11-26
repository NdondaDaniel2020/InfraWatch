"""Testes unitários para route handlers de Janelas de Manutenção (SLA)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.sla.api.routes.maintenance_windows import (
    approve_maintenance_window,
    create_maintenance_window,
    delete_maintenance_window,
    get_maintenance_kpis,
    list_maintenance_windows,
    update_maintenance_window,
)
from src.contexts.sla.schemas.requests import (
    CreateMaintenanceWindowRequest,
    UpdateMaintenanceWindowRequest,
)
from src.contexts.sla.schemas.responses import (
    MaintenanceKpiSummaryResponse,
    MaintenanceWindowResponse,
)
from src.core.web.pagination import PaginationParams


@pytest.fixture
def current_user():
    return AuthenticatedUser(
        id=str(uuid4()),
        email="operator@corp.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=str(uuid4()),
    )


@pytest.fixture
def sample_window():
    now = datetime.now(UTC)
    return MaintenanceWindowResponse(
        id=uuid4(),
        organization_id=uuid4(),
        device_id=uuid4(),
        device_name="Switch Core",
        description="Atualização de segurança",
        start_time=now,
        end_time=now + timedelta(hours=2),
        is_approved=True,
        created_at=now,
    )


@pytest.mark.asyncio
async def test_list_and_kpi_handlers(current_user, sample_window) -> None:
    """Valida listagem e KPIs de janelas de manutenção."""
    mock_service = AsyncMock()
    mock_service.list_maintenance_windows_with_details.return_value = ([sample_window], 1)
    mock_kpi = MaintenanceKpiSummaryResponse(
        active_now_count=1,
        scheduled_count=2,
        exempted_hours_month=16.5,
        contractual_limit_hours=8.0,
    )
    mock_service.get_maintenance_kpi_summary.return_value = mock_kpi

    # 1. list_maintenance_windows
    pagination = PaginationParams(page=1, page_size=10)
    list_res = await list_maintenance_windows(
        user=current_user,
        service=mock_service,
        pagination=pagination,
    )
    assert list_res.total == 1
    assert list_res.items[0].description == "Atualização de segurança"

    # 2. get_maintenance_kpis
    kpis = await get_maintenance_kpis(user=current_user, service=mock_service)
    assert kpis.active_now_count == 1
    assert kpis.exempted_hours_month == 16.5


@pytest.mark.asyncio
async def test_create_update_approve_delete_handlers(current_user, sample_window) -> None:
    """Valida CRUD e ciclo de aprovação de janelas de manutenção."""
    mock_service = AsyncMock()
    mock_service.create_maintenance_window.return_value = sample_window
    mock_service.update_maintenance_window.return_value = sample_window
    mock_service.approve_maintenance_window.return_value = sample_window
    mock_service.delete_maintenance_window.return_value = True

    now = datetime.now(UTC)
    req = CreateMaintenanceWindowRequest(
        device_id=sample_window.device_id,
        organization_id=sample_window.organization_id,
        title="Upgrade Firmware",
        description="Upgrade",
        start_time=now,
        end_time=now + timedelta(hours=2),
    )

    # 1. create
    created = await create_maintenance_window(payload=req, user=current_user, service=mock_service)
    assert created.description == "Atualização de segurança"

    # 2. update
    up_req = UpdateMaintenanceWindowRequest(title="Upgrade Firmware V2")
    updated = await update_maintenance_window(
        window_id=sample_window.id,
        payload=up_req,
        user=current_user,
        service=mock_service,
    )
    assert updated.id == sample_window.id

    # 3. approve
    approved = await approve_maintenance_window(
        window_id=sample_window.id,
        user=current_user,
        service=mock_service,
    )
    assert approved.is_approved is True

    # 4. delete
    await delete_maintenance_window(
        window_id=sample_window.id,
        user=current_user,
        service=mock_service,
    )
