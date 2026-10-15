"""Rotas REST para consultas e cálculo analítico de SLA contratual."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.contexts.iam.api.dependencies import CurrentUserDep, require_roles
from src.contexts.iam.domain.enums import UserRole
from src.contexts.sla.api.dependencies import SlaServiceDep
from src.contexts.sla.api.presenters.csv_presenter import SlaCsvPresenter
from src.contexts.sla.schemas.responses import SlaReportResponse

router = APIRouter(prefix="/api/v1/sla", tags=["SLA & Contractual Compliance"])

READ_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.ORG_ADMIN,
    UserRole.CLIENT_VIEWER,
]


@router.get(
    "/devices/{device_id}",
    response_model=SlaReportResponse,
    summary="Calcular SLA contratual de dispositivo",
)
async def get_device_sla(
    device_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    start_period: Annotated[datetime | None, Query(description="Início do período (UTC)")] = None,
    end_period: Annotated[datetime | None, Query(description="Fim do período (UTC)")] = None,
    target: Annotated[
        float, Query(ge=0.0, le=100.0, description="Meta contratual de SLA (%)")
    ] = 99.50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> SlaReportResponse:
    """Calcula disponibilidade, MTTR e MTBF do ativo considerando isenção de janelas aprovadas."""
    try:
        device, report = await service.get_device_with_sla(
            device_id=device_id,
            start_period=start_period,
            end_period=end_period,
            sla_target=target,
        )
    except ValueError as err:
        error_msg = str(err)
        if "não encontrado" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg,
            ) from err
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        ) from err

    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and str(device.organization_id) != user.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados de SLA deste dispositivo.",
        )

    return report


@router.get(
    "/devices/{device_id}/export",
    summary="Exportar relatório analítico de SLA de dispositivo (CSV/JSON)",
    response_model=None,
)
async def export_device_sla(
    device_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    format: Annotated[str, Query(description="Formato de exportação: csv ou json")] = "csv",
    start_period: Annotated[datetime | None, Query(description="Início do período (UTC)")] = None,
    end_period: Annotated[datetime | None, Query(description="Fim do período (UTC)")] = None,
    target: Annotated[
        float, Query(ge=0.0, le=100.0, description="Meta contratual de SLA (%)")
    ] = 99.50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> Response:
    """Exporta o relatório analítico de SLA em formato CSV para download ou JSON."""
    try:
        device, report = await service.get_device_with_sla(
            device_id=device_id,
            start_period=start_period,
            end_period=end_period,
            sla_target=target,
        )
    except ValueError as err:
        error_msg = str(err)
        if "não encontrado" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg,
            ) from err
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        ) from err

    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and str(device.organization_id) != user.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados de SLA deste dispositivo.",
        )

    if format.lower() == "json":
        return Response(
            content=report.model_dump_json(),
            media_type="application/json",
        )

    csv_data = SlaCsvPresenter.format_single_device(device, report)
    filename = f"sla_report_{device_id}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/organizations/{organization_id}/export",
    summary="Exportar relatório consolidado de SLA da organização (CSV)",
    response_model=None,
)
async def export_organization_sla(
    organization_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    start_period: Annotated[datetime | None, Query(description="Início do período (UTC)")] = None,
    end_period: Annotated[datetime | None, Query(description="Fim do período (UTC)")] = None,
    target: Annotated[
        float, Query(ge=0.0, le=100.0, description="Meta contratual padrão de SLA (%)")
    ] = 99.50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> Response:
    """Exporta o relatório consolidado de SLA de todos os ativos da organização em formato CSV."""
    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and user.organization_id != str(organization_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados desta organização.",
        )

    try:
        reports = await service.get_organization_sla_reports(
            organization_id=organization_id,
            start_period=start_period,
            end_period=end_period,
            default_target=target,
        )
        csv_data = SlaCsvPresenter.format_multiple_devices(reports)
        filename = f"sla_organization_{organization_id}.csv"
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err
