"""Rotas REST da API para Gestão de Organizações e Multi-Tenancy (ADR-003, ADR-012)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from src.api.dependencies import CurrentUserDep, enforce_tenant_scope, require_roles
from src.contexts.identity.domain.enums import UserRole
from src.contexts.identity.domain.events import OrganizationCreatedEvent
from src.contexts.organization.domain.models import OrganizationModel
from src.contexts.organization.schemas.organization import (
    OrganizationCreate,
    OrganizationListResponse,
    OrganizationResponse,
)
from src.core.database.session import DbSessionDep
from src.core.events.outbox_repository import OutboxRepository

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
    offset = (page - 1) * size
    query = select(OrganizationModel)
    count_query = select(func.count(OrganizationModel.id))

    # Isolamento de tenant: usuários não-globais só visualizam a própria organização
    if not (current_user.is_super_admin or current_user.role == UserRole.NOC_OPERATOR):
        if not current_user.organization_id:
            return OrganizationListResponse(items=[], total=0, page=page, size=size)
        tenant_uuid = UUID(current_user.organization_id)
        query = query.where(OrganizationModel.id == tenant_uuid)
        count_query = count_query.where(OrganizationModel.id == tenant_uuid)

    total_res = await db.execute(count_query)
    total = int(total_res.scalar() or 0)

    items_res = await db.execute(
        query.order_by(OrganizationModel.name.asc()).offset(offset).limit(size)
    )
    organizations = items_res.scalars().all()

    return OrganizationListResponse(
        items=[OrganizationResponse.model_validate(org) for org in organizations],
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
    # Valida unicidade do slug
    existing = await db.execute(
        select(OrganizationModel).where(OrganizationModel.slug == body.slug)
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe uma organização cadastrada com o slug '{body.slug}'.",
        )

    org = OrganizationModel(
        name=body.name,
        slug=body.slug,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        tier=body.tier.value,
        sla_target_default=body.sla_target_default,
    )
    db.add(org)
    await db.flush()  # Atribui o ID gerado

    # Registra evento no Transactional Outbox
    event = OrganizationCreatedEvent(
        aggregate_id=org.id,
        organization_id=org.id,
        name=org.name,
        slug=org.slug,
        tier=org.tier,
    )
    OutboxRepository.add_event(db, event, aggregate_type="Organization")
    await db.commit()
    await db.refresh(org)

    return OrganizationResponse.model_validate(org)


@router.get("/{org_id}", response_model=OrganizationResponse, summary="Detalhes de uma organização")
async def get_organization(
    org_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> OrganizationResponse:
    """Retorna detalhes de uma organização sob validação rigorosa de escopo multi-tenant."""
    enforce_tenant_scope(org_id, current_user)

    res = await db.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
    org = res.scalars().first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organização não encontrada.",
        )

    return OrganizationResponse.model_validate(org)
