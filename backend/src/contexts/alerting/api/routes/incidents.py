"""Rotas REST para gestão do ciclo de vida de incidentes operacionais."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.contexts.alerting.api.dependencies import IncidentServiceDep
from src.contexts.alerting.domain.exceptions import (
    IncidentAlreadyResolvedError,
    IncidentNotFoundError,
)
from src.contexts.alerting.schemas.requests import (
    AcknowledgeIncidentRequest,
    CreateIncidentRequest,
    ResolveIncidentRequest,
)
from src.contexts.alerting.schemas.responses import (
    IncidentListResponse,
    IncidentResponse,
)
from src.contexts.iam.api.dependencies import (
    CurrentUserDep,
    require_roles,
)
from src.contexts.iam.domain.enums import UserRole

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents & SLA"])

# Permissões: Operadores NOC e Administradores
OPERATOR_ROLES = [UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR, UserRole.ORG_ADMIN]
READ_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.ORG_ADMIN,
    UserRole.CLIENT_VIEWER,
]


@router.get("", response_model=IncidentListResponse, summary="Listar incidentes")
async def list_incidents(
    user: CurrentUserDep,
    service: IncidentServiceDep,
    organization_id: Annotated[UUID | None, Query(description="Filtrar por organização")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filtrar por status")] = None,
    device_id: Annotated[UUID | None, Query(description="Filtrar por dispositivo")] = None,
    page: Annotated[int, Query(ge=1, description="Número da página")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Itens por página")] = 50,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> IncidentListResponse:
    """Lista incidentes registrados com suporte a filtros e isolamento de tenant."""
    # Clientes regulares ficam restritos à sua própria organização
    if user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN} and user.organization_id:
        organization_id = UUID(user.organization_id)

    offset = (page - 1) * page_size
    items, total = await service.list_incidents(
        organization_id=organization_id,
        status=status_filter,
        device_id=device_id,
        limit=page_size,
        offset=offset,
    )

    return IncidentListResponse(
        items=[IncidentResponse.from_domain(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=IncidentResponse, summary="Criar incidente")
async def create_incident(
    payload: CreateIncidentRequest,
    user: CurrentUserDep,
    service: IncidentServiceDep,
    _: object = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)),
) -> IncidentResponse:
    """Registra uma nova ocorrência crítica de incidente na infraestrutura."""
    incident = await service.create_incident(payload)
    return IncidentResponse.from_domain(incident)


@router.get("/{incident_id}", response_model=IncidentResponse, summary="Obter detalhes de incidente")
async def get_incident(
    incident_id: UUID,
    user: CurrentUserDep,
    service: IncidentServiceDep,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> IncidentResponse:
    """Recupera detalhes técnicos de um incidente por ID."""
    try:
        incident = await service.get_incident(incident_id)
    except IncidentNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err

    # Validação de escopo multitenant
    if (
        user.role in {UserRole.CLIENT_VIEWER, UserRole.ORG_ADMIN}
        and user.organization_id
        and incident.organization_id
        and UUID(user.organization_id) != incident.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado ao incidente deste tenant.",
        )

    return IncidentResponse.from_domain(incident)


@router.post("/{incident_id}/acknowledge", response_model=IncidentResponse, summary="Reconhecer incidente")
async def acknowledge_incident(
    incident_id: UUID,
    user: CurrentUserDep,
    service: IncidentServiceDep,
    payload: AcknowledgeIncidentRequest | None = None,
    _: object = Depends(require_roles(*OPERATOR_ROLES)),
) -> IncidentResponse:
    """Atribui o operador logado ao incidente, silencia alertas e emite broadcast SSE."""
    try:
        operator_id = UUID(user.id)
        acknowledged_at = payload.acknowledged_at if payload else None
        incident = await service.acknowledge_incident(
            incident_id=incident_id,
            operator_id=operator_id,
            acknowledged_at=acknowledged_at,
        )
        return IncidentResponse.from_domain(incident)
    except IncidentNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except IncidentAlreadyResolvedError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err


@router.post("/{incident_id}/resolve", response_model=IncidentResponse, summary="Resolver incidente")
async def resolve_incident(
    incident_id: UUID,
    payload: ResolveIncidentRequest,
    user: CurrentUserDep,
    service: IncidentServiceDep,
    _: object = Depends(require_roles(*OPERATOR_ROLES)),
) -> IncidentResponse:
    """Encerra o incidente com causa raiz, computa o downtime e emite broadcast SSE."""
    try:
        operator_id = UUID(user.id)
        incident = await service.resolve_incident(
            incident_id=incident_id,
            root_cause=payload.root_cause,
            operator_id=operator_id,
            resolved_at=payload.resolved_at,
        )
        return IncidentResponse.from_domain(incident)
    except IncidentNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except IncidentAlreadyResolvedError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err
