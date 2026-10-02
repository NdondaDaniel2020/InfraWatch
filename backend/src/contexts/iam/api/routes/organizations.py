"""Rotas REST da API para Gestão de Organizações e Multi-Tenancy (ADR-003, ADR-012)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.contexts.iam.api.dependencies import CurrentUserDep, enforce_tenant_scope, require_roles
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.organization import (
    OrganizationCreate,
    OrganizationListResponse,
    OrganizationResponse,
)
from src.contexts.iam.services.organization_service import OrganizationService
from src.core.database.session import DbSessionDep

router = APIRouter(prefix="/api/v1/organizations", tags=["Organizations"])


@router.get(
    "", response_model=OrganizationListResponse, summary="Listagem paginada de organizações"
)
async def list_organizations(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(default=1, ge=1, description="Número da página"),
    size: int = Query(default=20, ge=1, le=100, description="Itens por página"),
) -> OrganizationListResponse:
    """Lista organizações respeitando o escopo de tenant do usuário conectado.

    Super Administradores e Operadores NOC visualizam todos os clientes.
    Usuários vinculados a clientes corporativos visualizam estritamente seu tenant.
    """
    service = OrganizationService(db)
    items, total = await service.list_organizations(
        user_is_super_admin=current_user.is_super_admin,
        user_role=current_user.role,
        user_org_id=current_user.organization_id,
        page=page,
        size=size,
    )
    return OrganizationListResponse(
        items=[OrganizationResponse.model_validate(org) for org in items],
        total=total,
        page=page,
        size=size,
    )


@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN))],
    summary="Criação de organização (restrito a SUPER_ADMIN)",
)
async def create_organization(
    body: OrganizationCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> OrganizationResponse:
    """Cadastra um novo cliente tenant no sistema e registra evento via Transactional Outbox."""
    service = OrganizationService(db)
    org = await service.create_organization(body)
    return OrganizationResponse.model_validate(org)


@router.get("/{org_id}", response_model=OrganizationResponse, summary="Detalhes de uma organização")
async def get_organization(
    org_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> OrganizationResponse:
    """Retorna detalhes de uma organização sob validação rigorosa de escopo multi-tenant."""
    enforce_tenant_scope(org_id, current_user)
    service = OrganizationService(db)
    org = await service.get_organization_by_id(org_id)
    return OrganizationResponse.model_validate(org)
