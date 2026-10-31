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
from src.contexts.sla.schemas.requests import CreateSupportTicketRequest
from src.contexts.sla.schemas.responses import (
    OrganizationSlaHistoryResponse,
    OrganizationSlaReportDetailsResponse,
    OrganizationSlaSummaryResponse,
    SlaReportResponse,
    SupportTicketResponse,
)

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


@router.get(
    "/organizations/{organization_id}/summary",
    response_model=OrganizationSlaSummaryResponse,
    summary="Resumo de SLA consolidado para o portal do cliente",
)
async def get_organization_sla_summary(
    organization_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> OrganizationSlaSummaryResponse:
    """Retorna o resumo executivo de SLA de uma organização para o portal."""
    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and user.organization_id != str(organization_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados desta organização.",
        )

    return await service.get_organization_sla_summary(organization_id)


@router.get(
    "/summary",
    response_model=OrganizationSlaSummaryResponse,
    summary="Resumo de SLA da organização do usuário logado",
)
async def get_current_user_sla_summary(
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> OrganizationSlaSummaryResponse:
    """Retorna o resumo executivo de SLA da organização vinculada ao usuário logado."""
    org_id_str = user.organization_id
    if not org_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não possui organização vinculada.",
        )
    return await service.get_organization_sla_summary(UUID(org_id_str))


@router.get(
    "/organizations/{organization_id}/history",
    response_model=OrganizationSlaHistoryResponse,
    summary="Histórico mensal de SLA da organização",
)
async def get_organization_sla_history(
    organization_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    months: Annotated[int, Query(ge=1, le=24, description="Quantidade de meses")] = 6,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> OrganizationSlaHistoryResponse:
    """Retorna a série histórica de conformidade de SLA da organização."""
    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and user.organization_id != str(organization_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados desta organização.",
        )

    return await service.get_organization_sla_history(organization_id, months_count=months)


@router.get(
    "/organizations/{organization_id}/report",
    response_model=OrganizationSlaReportDetailsResponse,
    summary="Dados consolidados para relatório oficial de SLA em PDF",
)
async def get_organization_sla_report_details(
    organization_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    start_period: Annotated[datetime | None, Query(description="Início do período")] = None,
    end_period: Annotated[datetime | None, Query(description="Fim do período")] = None,
    target: Annotated[float, Query(ge=0.0, le=100.0, description="Meta SLA (%)")] = 99.50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> OrganizationSlaReportDetailsResponse:
    """Retorna dados consolidados para compilação e assinatura digital do relatório de SLA."""
    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and user.organization_id != str(organization_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados desta organização.",
        )

    return await service.get_organization_sla_report_details(
        organization_id=organization_id,
        start_period=start_period,
        end_period=end_period,
        target=target,
    )


@router.post(
    "/organizations/{organization_id}/support-ticket",
    response_model=SupportTicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Abertura de chamado de suporte técnico pelo cliente",
)
async def create_client_support_ticket(
    organization_id: UUID,
    payload: CreateSupportTicketRequest,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> SupportTicketResponse:
    """Registra abertura de chamado de suporte e aciona a fila do NOC."""
    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and user.organization_id != str(organization_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado para abrir chamados em nome desta organização.",
        )

    return await service.create_support_ticket(
        organization_id=organization_id,
        payload=payload,
        user_email=user.email,
    )

