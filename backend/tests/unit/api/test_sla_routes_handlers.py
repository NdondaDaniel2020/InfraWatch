"""Testes unitários para route handlers de SLA (ADR-011)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.sla.api.routes.sla import export_device_sla, get_device_sla
from src.contexts.sla.schemas.responses import SlaReportResponse


@pytest.fixture
def current_user():
    return AuthenticatedUser(
        id=str(uuid4()),
        email="sla-operator@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
        organization_id=str(uuid4()),
    )


@pytest.mark.asyncio
async def test_get_device_sla_success_and_errors(current_user) -> None:
    """Valida consulta de SLA com sucesso, 404 e restrição de tenant."""
    mock_service = AsyncMock()
    device_id = uuid4()
    org_id = uuid4()

    mock_device = MagicMock()
    mock_device.id = device_id
    mock_device.organization_id = org_id

    now = datetime.now(UTC)
    mock_report = SlaReportResponse(
        device_id=device_id,
        start_period=now,
        end_period=now,
        total_period_hours=24.0,
        unplanned_downtime_minutes=0.0,
        exempted_downtime_minutes=0.0,
        uptime_percentage=100.0,
        sla_target=99.5,
        sla_met=True,
        mttr_minutes=0.0,
        mtbf_hours=24.0,
        incidents_count=0,
        exempted_incidents_count=0,
    )

    # 1. Sucesso
    mock_service.get_device_with_sla.return_value = (mock_device, mock_report)
    res = await get_device_sla(device_id=device_id, user=current_user, service=mock_service)
    assert res.uptime_percentage == 100.0
    assert res.sla_met is True

    # 2. Ativo não encontrado (404)
    mock_service.get_device_with_sla.side_effect = ValueError("Dispositivo não encontrado")
    with pytest.raises(HTTPException) as exc_404:
        await get_device_sla(device_id=device_id, user=current_user, service=mock_service)
    assert exc_404.value.status_code == 404

    # 3. Acesso proibido para viewer de outra organização (403)
    viewer_user = AuthenticatedUser(
        id=str(uuid4()),
        email="viewer@client.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),  # Org diferente da do dispositivo
    )
    mock_service.get_device_with_sla.side_effect = None
    mock_service.get_device_with_sla.return_value = (mock_device, mock_report)
    with pytest.raises(HTTPException) as exc_403:
        await get_device_sla(device_id=device_id, user=viewer_user, service=mock_service)
    assert exc_403.value.status_code == 403


@pytest.mark.asyncio
async def test_organization_sla_summary_and_daily_handlers(current_user) -> None:
    """Valida get_organization_sla_summary, get_current_user_sla_summary e get_current_user_daily_sla."""
    from src.contexts.sla.api.routes.sla import (
        get_current_user_daily_sla,
        get_current_user_sla_summary,
        get_organization_daily_sla,
        get_organization_sla_history,
        get_organization_sla_report_details,
        get_organization_sla_summary,
    )

    mock_service = AsyncMock()
    org_id = UUID(current_user.organization_id)

    # 1. get_organization_sla_summary sucesso e forbidden
    mock_service.get_organization_sla_summary.return_value = MagicMock(organization_id=org_id)
    summary_res = await get_organization_sla_summary(
        organization_id=org_id,
        user=current_user,
        service=mock_service,
    )
    assert summary_res.organization_id == org_id

    viewer_other = AuthenticatedUser(
        id=str(uuid4()),
        email="viewer@other.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),
    )
    with pytest.raises(HTTPException) as exc_org_403:
        await get_organization_sla_summary(
            organization_id=org_id,
            user=viewer_other,
            service=mock_service,
        )
    assert exc_org_403.value.status_code == 403

    # 2. get_current_user_sla_summary
    user_summary_res = await get_current_user_sla_summary(
        user=current_user,
        service=mock_service,
    )
    assert user_summary_res.organization_id == org_id

    user_no_org = AuthenticatedUser(
        id=str(uuid4()),
        email="no_org@corp.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=None,
    )
    with pytest.raises(HTTPException) as exc_no_org:
        await get_current_user_sla_summary(
            user=user_no_org,
            service=mock_service,
        )
    assert exc_no_org.value.status_code == 400

    # 3. get_current_user_daily_sla & get_organization_daily_sla
    mock_service.get_organization_daily_sla.return_value = MagicMock(organization_id=org_id)
    daily_res = await get_current_user_daily_sla(
        user=current_user,
        service=mock_service,
    )
    assert daily_res.organization_id == org_id

    # Erro de validação
    mock_service.get_organization_daily_sla.side_effect = ValueError("Invalid year/month")
    with pytest.raises(HTTPException) as exc_daily_val:
        await get_organization_daily_sla(
            organization_id=org_id,
            user=current_user,
            service=mock_service,
        )
    assert exc_daily_val.value.status_code == 400

    # 4. get_organization_sla_history & report_details
    mock_service.get_organization_daily_sla.side_effect = None
    mock_service.get_organization_sla_history.return_value = MagicMock(organization_id=org_id)
    hist_res = await get_organization_sla_history(
        organization_id=org_id,
        user=current_user,
        service=mock_service,
        months=6,
    )
    assert hist_res.organization_id == org_id

    mock_audit = AsyncMock()
    mock_service.get_organization_sla_report_details.return_value = MagicMock(
        organization_id=org_id
    )
    rep_res = await get_organization_sla_report_details(
        organization_id=org_id,
        user=current_user,
        service=mock_service,
        audit_service=mock_audit,
    )
    assert rep_res.organization_id == org_id
    mock_audit.record_action.assert_called_once()


@pytest.mark.asyncio
async def test_export_device_sla_csv_and_json(current_user) -> None:
    """Valida exportação analítica de SLA nos formatos CSV e JSON."""
    mock_service = AsyncMock()
    mock_audit = AsyncMock()
    device_id = uuid4()
    org_id = UUID(current_user.organization_id)

    mock_device = MagicMock()
    mock_device.id = device_id
    mock_device.organization_id = org_id

    now = datetime.now(UTC)
    mock_report = SlaReportResponse(
        device_id=device_id,
        start_period=now,
        end_period=now,
        total_period_hours=24.0,
        unplanned_downtime_minutes=0.0,
        exempted_downtime_minutes=0.0,
        uptime_percentage=100.0,
        sla_target=99.5,
        sla_met=True,
        mttr_minutes=0.0,
        mtbf_hours=24.0,
        incidents_count=0,
        exempted_incidents_count=0,
    )
    mock_service.get_device_with_sla.return_value = (mock_device, mock_report)

    # Export CSV
    csv_resp = await export_device_sla(
        device_id=device_id,
        user=current_user,
        service=mock_service,
        audit_service=mock_audit,
        format="csv",
    )
    assert csv_resp.media_type == "text/csv"
    assert "Uptime (%)" in csv_resp.body.decode("utf-8")

    # Export JSON
    json_resp = await export_device_sla(
        device_id=device_id,
        user=current_user,
        service=mock_service,
        audit_service=mock_audit,
        format="json",
    )
    assert json_resp.media_type == "application/json"
