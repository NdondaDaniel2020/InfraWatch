"""Rotas REST para gestão do ciclo de vida de incidentes operacionais."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.contexts.alerting.api.dependencies import IncidentServiceDep, ScopedIncidentDep
from src.contexts.alerting.domain.exceptions import IncidentAlreadyResolvedError
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
from src.core.web.dependencies import PaginationParamsDep

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
    pagination: PaginationParamsDep,
    organization_id: Annotated[UUID | None, Query(description="Filtrar por organização")] = None,
    status_filter: Annotated[
        str | None, Query(alias="status", description="Filtrar por status")
    ] = None,
    device_id: Annotated[UUID | None, Query(description="Filtrar por dispositivo")] = None,
    _: object = Depends(require_roles(*READ_ROLES)),
) -> IncidentListResponse:
    """Lista incidentes registrados com suporte a filtros e isolamento de tenant."""
    # Validação e resolução estrita de tenant scope (prevenção BOLA / IDOR)
    if not user.is_global_operator:
        if organization_id and str(organization_id) != user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado: você não tem permissão para visualizar incidentes de outra organização.",
            )
        resolved_org_id = UUID(user.organization_id) if user.organization_id else None
    else:
        resolved_org_id = organization_id

    items, total = await service.list_incidents(
        organization_id=resolved_org_id,
        status=status_filter,
        device_id=device_id,
        limit=pagination.limit,
        offset=pagination.offset,
    )

    return IncidentListResponse(
        items=[IncidentResponse.from_domain(item) for item in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=IncidentResponse,
    summary="Criar incidente",
)
async def create_incident(
    payload: CreateIncidentRequest,
    user: CurrentUserDep,
    service: IncidentServiceDep,
    _: object = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)),
) -> IncidentResponse:
    """Registra uma nova ocorrência crítica de incidente na infraestrutura."""
    incident = await service.create_incident(payload)
    return IncidentResponse.from_domain(incident)


@router.get(
    "/{incident_id}",
    response_model=IncidentResponse,
    summary="Obter detalhes de incidente",
    dependencies=[Depends(require_roles(*READ_ROLES))],
)
async def get_incident(
    incident: ScopedIncidentDep,
) -> IncidentResponse:
    """Recupera detalhes técnicos de um incidente por ID."""
    return IncidentResponse.from_domain(incident)


@router.post(
    "/{incident_id}/acknowledge",
    response_model=IncidentResponse,
    summary="Reconhecer incidente",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def acknowledge_incident(
    incident: ScopedIncidentDep,
    user: CurrentUserDep,
    service: IncidentServiceDep,
    payload: AcknowledgeIncidentRequest | None = None,
) -> IncidentResponse:
    """Atribui o operador logado ao incidente, silencia alertas e emite broadcast SSE."""
    try:
        operator_id = UUID(user.id)
        acknowledged_at = payload.acknowledged_at if payload else None
        updated = await service.acknowledge_incident(
            incident_id=incident.id,
            operator_id=operator_id,
            acknowledged_at=acknowledged_at,
        )
        return IncidentResponse.from_domain(updated)
    except IncidentAlreadyResolvedError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err


@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentResponse,
    summary="Resolver incidente",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def resolve_incident(
    incident: ScopedIncidentDep,
    payload: ResolveIncidentRequest,
    user: CurrentUserDep,
    service: IncidentServiceDep,
) -> IncidentResponse:
    """Encerra o incidente com causa raiz, computa o downtime e emite broadcast SSE."""
    try:
        operator_id = UUID(user.id)
        updated = await service.resolve_incident(
            incident_id=incident.id,
            root_cause=payload.root_cause,
            operator_id=operator_id,
            resolved_at=payload.resolved_at,
        )
        return IncidentResponse.from_domain(updated)
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


@router.post(
    "/{incident_id}/glpi-ticket",
    response_model=IncidentResponse,
    summary="Abrir chamado manual no GLPI",
    dependencies=[Depends(require_roles(*OPERATOR_ROLES))],
)
async def create_glpi_ticket_for_incident(
    incident: ScopedIncidentDep,
    user: CurrentUserDep,
    service: IncidentServiceDep,
) -> IncidentResponse:
    """Abre manualmente um chamado no GLPI em 1 clique para o incidente e vincula o ticket_id."""
    try:
        operator_id = UUID(user.id)
        updated = await service.create_glpi_ticket(
            incident_id=incident.id,
            operator_id=operator_id,
        )
        return IncidentResponse.from_domain(updated)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except RuntimeError as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(err),
        ) from err
