"""Rotas REST para consultas e cálculo analítico de SLA contratual."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from src.contexts.iam.api.dependencies import CurrentUserDep, require_roles
from src.contexts.iam.domain.enums import UserRole
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.sla.api.dependencies import SlaServiceDep
from src.contexts.sla.schemas.responses import SlaReportResponse
from src.core.database.session import DbSessionDep

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
    session: DbSessionDep,
    start_period: Annotated[datetime | None, Query(description="Início do período (UTC)")] = None,
    end_period: Annotated[datetime | None, Query(description="Fim do período (UTC)")] = None,
    target: Annotated[float, Query(ge=0.0, le=100.0, description="Meta contratual de SLA (%)")] = 99.50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> SlaReportResponse:
    """Calcula disponibilidade, MTTR e MTBF do ativo considerando isenção de janelas aprovadas."""
    # Valida existência do dispositivo e isolamento multitenant
    device_res = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = device_res.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dispositivo com id '{device_id}' não encontrado.",
        )

    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and str(device.organization_id) != user.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado aos dados de SLA deste dispositivo.",
        )

    try:
        return await service.calculate_device_sla(
            device_id=device_id,
            start_period=start_period,
            end_period=end_period,
            sla_target=target,
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err
