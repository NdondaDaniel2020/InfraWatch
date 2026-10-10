"""Rotas REST para CRUD e aprovação de Janelas de Manutenção Programada."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.contexts.iam.api.dependencies import CurrentUserDep, require_roles
from src.contexts.iam.domain.enums import UserRole
from src.contexts.sla.api.dependencies import SlaServiceDep
from src.contexts.sla.schemas.requests import (
    CreateMaintenanceWindowRequest,
    UpdateMaintenanceWindowRequest,
)
from src.contexts.sla.schemas.responses import (
    MaintenanceWindowListResponse,
    MaintenanceWindowResponse,
)

router = APIRouter(prefix="/api/v1/maintenance-windows", tags=["Maintenance Windows"])

OPERATOR_ROLES = [UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR, UserRole.ORG_ADMIN]
READ_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.ORG_ADMIN,
    UserRole.CLIENT_VIEWER,
]


@router.get("", response_model=MaintenanceWindowListResponse, summary="Listar janelas de manutenção")
async def list_maintenance_windows(
    user: CurrentUserDep,
    service: SlaServiceDep,
    device_id: Annotated[UUID | None, Query(description="Filtrar por dispositivo")] = None,
    is_approved: Annotated[bool | None, Query(description="Filtrar por aprovação")] = None,
    organization_id: Annotated[UUID | None, Query(description="Filtrar por organização")] = None,
    page: Annotated[int, Query(ge=1, description="Número da página")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Itens por página")] = 50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> MaintenanceWindowListResponse:
    """Lista janelas de manutenção programada registradas na plataforma."""
    if user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN} and user.organization_id:
        organization_id = UUID(user.organization_id)

    offset = (page - 1) * page_size
    items, total = await service.list_maintenance_windows(
        organization_id=organization_id,
        device_id=device_id,
        is_approved=is_approved,
        limit=page_size,
        offset=offset,
    )

    return MaintenanceWindowListResponse(
        items=[MaintenanceWindowResponse.from_domain(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=MaintenanceWindowResponse,
    summary="Criar janela de manutenção",
)
async def create_maintenance_window(
    payload: CreateMaintenanceWindowRequest,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*OPERATOR_ROLES)),
) -> MaintenanceWindowResponse:
    """Agenda uma nova janela de manutenção programada na infraestrutura."""
    if user.role == UserRole.ORG_ADMIN and user.organization_id:
        payload.organization_id = UUID(user.organization_id)

    try:
        window = await service.create_maintenance_window(payload)
        return MaintenanceWindowResponse.from_domain(window)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.get(
    "/{window_id}",
    response_model=MaintenanceWindowResponse,
    summary="Obter detalhes de janela de manutenção",
)
async def get_maintenance_window(
    window_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> MaintenanceWindowResponse:
    """Recupera detalhes programados de uma janela de manutenção."""
    window = await service.get_maintenance_window(window_id)
    if window is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Janela de manutenção com id '{window_id}' não encontrada.",
        )

    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and window.organization_id
        and str(window.organization_id) != user.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado a esta janela de manutenção.",
        )

    return MaintenanceWindowResponse.from_domain(window)


@router.patch(
    "/{window_id}",
    response_model=MaintenanceWindowResponse,
    summary="Atualizar janela de manutenção",
)
async def update_maintenance_window(
    window_id: UUID,
    payload: UpdateMaintenanceWindowRequest,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*OPERATOR_ROLES)),
) -> MaintenanceWindowResponse:
    """Altera parâmetros agendados de uma janela de manutenção."""
    existing = await service.get_maintenance_window(window_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Janela de manutenção com id '{window_id}' não encontrada.",
        )

    if (
        user.role == UserRole.ORG_ADMIN
        and user.organization_id
        and existing.organization_id
        and str(existing.organization_id) != user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso não autorizado.")

    try:
        updated = await service.update_maintenance_window(window_id, payload)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Janela não encontrada.")
        return MaintenanceWindowResponse.from_domain(updated)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.post(
    "/{window_id}/approve",
    response_model=MaintenanceWindowResponse,
    summary="Aprovar formalmente janela de manutenção",
)
async def approve_maintenance_window(
    window_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)),
) -> MaintenanceWindowResponse:
    """Aprova formalmente uma janela programada para isenção de penalidade de SLA."""
    approved = await service.approve_maintenance_window(window_id)
    if approved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Janela de manutenção com id '{window_id}' não encontrada.",
        )
    return MaintenanceWindowResponse.from_domain(approved)


@router.delete(
    "/{window_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir janela de manutenção",
)
async def delete_maintenance_window(
    window_id: UUID,
    user: CurrentUserDep,
    service: SlaServiceDep,
    _: object = Depends(require_roles(*OPERATOR_ROLES)),
) -> Response:
    """Remove o agendamento de uma janela de manutenção."""
    existing = await service.get_maintenance_window(window_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Janela de manutenção com id '{window_id}' não encontrada.",
        )

    if (
        user.role == UserRole.ORG_ADMIN
        and user.organization_id
        and existing.organization_id
        and str(existing.organization_id) != user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso não autorizado.")

    await service.delete_maintenance_window(window_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
