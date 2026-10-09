from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from src.contexts.iam.api.dependencies import (
    AuthenticatedUser,
    ClientIPDep,
    CurrentUserDep,
    enforce_tenant_scope,
    require_roles,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.inventory.api.dependencies.dependencies import (
    DeviceCommandServiceDep,
    DeviceQueryServiceDep,
)
from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest,
    PauseDeviceRequest,
    ResumeDeviceRequest,
    SetMaintenanceRequest,
    UpdateDeviceRequest,
)
from src.contexts.inventory.schemas.device_schemas import (
    DeviceDetail,
    DeviceListItem,
    DeviceSearchResult,
)
from src.contexts.inventory.schemas.filters import DeviceFilters
from src.core.web.pagination import PaginatedResponse, PaginationParamsDep

router = APIRouter(prefix="/api/v1/devices", tags=["Devices"])

# SUPER_ADMIN e NOC_OPERATOR (global ops), ORG_ADMIN (tenant admin) 
WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR, UserRole.ORG_ADMIN]


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=DeviceDetail)
async def create_device(
    payload: CreateDeviceRequest,
    user: CurrentUserDep,
    client_ip: ClientIPDep,
    command_service: DeviceCommandServiceDep,
    query_service: DeviceQueryServiceDep,
    _: AuthenticatedUser = Depends(require_roles(*WRITE_ROLES)),
):
    """Cadastra um novo dispositivo no inventário."""
    # Garante que o usuário logado só cria na sua org, ou o org global se for NOC/SUPER_ADMIN
    # Como não recebemos a org_id no payload, usamos a do usuário
    org_id = UUID(user.organization_id) if user.organization_id else None
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O usuário não está vinculado a uma organização para cadastrar dispositivos.",
        )

    device = await command_service.create_device(
        cmd=payload,
        actor_user_id=UUID(user.id),
        actor_ip=client_ip,
        organization_id=org_id,
    )
    await command_service.session.commit()

    return await query_service.get_device_detail(org_id, device.id)


@router.get("/", response_model=PaginatedResponse[DeviceListItem])
async def list_devices(
    user: CurrentUserDep,
    pagination: PaginationParamsDep,
    query_service: DeviceQueryServiceDep,
    filters: DeviceFilters = Depends(),
    org_id: UUID | None = None,
):
    """Lista dispositivos da organização com filtros e paginação."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    is_viewer = user.role == UserRole.CLIENT_VIEWER.value
    
    return await query_service.list_devices(
        target_org,
        filters,
        pagination,
        is_viewer=is_viewer,
    )


@router.get("/search", response_model=PaginatedResponse[DeviceSearchResult])
async def search_devices(
    user: CurrentUserDep,
    pagination: PaginationParamsDep,
    query_service: DeviceQueryServiceDep,
    q: str = "",
    org_id: UUID | None = None,
):
    """Busca Full-Text por dispositivos na organização."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    is_viewer = user.role == UserRole.CLIENT_VIEWER.value
    
    return await query_service.search_devices(
        target_org,
        q,
        pagination,
        is_viewer=is_viewer,
    )


@router.get("/{device_id}", response_model=DeviceDetail)
async def get_device(
    device_id: UUID,
    user: CurrentUserDep,
    query_service: DeviceQueryServiceDep,
    org_id: UUID | None = None,
):
    """Obtém os detalhes de um dispositivo."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    is_viewer = user.role == UserRole.CLIENT_VIEWER.value
    
    device = await query_service.get_device_detail(target_org, device_id, is_viewer=is_viewer)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    return device


@router.put("/{device_id}", response_model=DeviceDetail)
async def update_device(
    device_id: UUID,
    payload: UpdateDeviceRequest,
    user: CurrentUserDep,
    client_ip: ClientIPDep,
    command_service: DeviceCommandServiceDep,
    query_service: DeviceQueryServiceDep,
    org_id: UUID | None = None,
    _: AuthenticatedUser = Depends(require_roles(*WRITE_ROLES)),
):
    """Atualiza propriedades de um dispositivo."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    
    await command_service.update_device(
        cmd=payload,
        actor_user_id=UUID(user.id),
        actor_ip=client_ip,
        device_id=device_id,
        organization_id=target_org,
    )
    await command_service.session.commit()
    
    return await query_service.get_device_detail(target_org, device_id)


@router.post("/{device_id}/pause", response_model=DeviceDetail)
async def pause_device(
    device_id: UUID,
    user: CurrentUserDep,
    client_ip: ClientIPDep,
    command_service: DeviceCommandServiceDep,
    query_service: DeviceQueryServiceDep,
    payload: PauseDeviceRequest | None = None,
    org_id: UUID | None = None,
    _: AuthenticatedUser = Depends(require_roles(*WRITE_ROLES)),
):
    """Pausa o monitoramento de um dispositivo."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    
    await command_service.pause_device(
        cmd=payload,
        actor_user_id=UUID(user.id),
        actor_ip=client_ip,
        device_id=device_id,
        organization_id=target_org,
    )
    await command_service.session.commit()
    
    return await query_service.get_device_detail(target_org, device_id)


@router.post("/{device_id}/resume", response_model=DeviceDetail)
async def resume_device(
    device_id: UUID,
    user: CurrentUserDep,
    client_ip: ClientIPDep,
    command_service: DeviceCommandServiceDep,
    query_service: DeviceQueryServiceDep,
    payload: ResumeDeviceRequest | None = None,
    org_id: UUID | None = None,
    _: AuthenticatedUser = Depends(require_roles(*WRITE_ROLES)),
):
    """Retoma o monitoramento de um dispositivo pausado."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    
    await command_service.resume_device(
        cmd=payload,
        actor_user_id=UUID(user.id),
        actor_ip=client_ip,
        device_id=device_id,
        organization_id=target_org,
    )
    await command_service.session.commit()
    
    return await query_service.get_device_detail(target_org, device_id)


@router.post("/{device_id}/maintenance", response_model=DeviceDetail)
async def set_maintenance(
    device_id: UUID,
    payload: SetMaintenanceRequest,
    user: CurrentUserDep,
    client_ip: ClientIPDep,
    command_service: DeviceCommandServiceDep,
    query_service: DeviceQueryServiceDep,
    org_id: UUID | None = None,
    _: AuthenticatedUser = Depends(require_roles(*WRITE_ROLES)),
):
    """Agenda janela de manutenção para um dispositivo."""
    target_org = UUID(enforce_tenant_scope(org_id, user))
    
    await command_service.set_maintenance(
        cmd=payload,
        actor_user_id=UUID(user.id),
        actor_ip=client_ip,
        device_id=device_id,
        organization_id=target_org,
    )
    await command_service.session.commit()
    
    return await query_service.get_device_detail(target_org, device_id)
