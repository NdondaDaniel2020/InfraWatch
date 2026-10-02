"""Serviço de domínio para gestão e ciclo de vida de Organizações/Tenants (OrganizationService)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.events import OrganizationCreatedEvent
from src.contexts.iam.domain.models import OrganizationModel
from src.contexts.iam.repositories.organization_repository import OrganizationRepository
from src.contexts.iam.schemas.organization import OrganizationCreate
from src.core.events.outbox_repository import OutboxRepository
from src.core.exceptions import ConflictError, NotFoundError


class OrganizationService:
    """Serviço de domínio para gerenciamento de organizações/tenants."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.org_repo = OrganizationRepository(session)

    async def get_organization_by_id(self, org_id: UUID) -> OrganizationModel:
        """Busca organização por ID ou levanta NotFoundError."""
        org = await self.org_repo.get_by_id(org_id)
        if not org:
            raise NotFoundError(
                f"Organização com ID '{org_id}' não encontrada.",
                payload={"entity": "Organization", "identifier": str(org_id)},
                code="ORGANIZATION_NOT_FOUND",
            )
        return org

    async def list_organizations(
        self,
        *,
        user_is_super_admin: bool,
        user_role: str,
        user_org_id: str | None,
        page: int = 1,
        size: int = 20,
    ) -> tuple[list[OrganizationModel], int]:
        """Lista organizações aplicando regras de isolamento multi-tenant.

        Super Administradores e Operadores NOC visualizam todos os clientes.
        Usuários vinculados a clientes corporativos visualizam estritamente seu tenant.
        """
        offset = (page - 1) * size

        # Isolamento de tenant: usuários não-globais só visualizam a própria organização
        if not (user_is_super_admin or user_role == UserRole.NOC_OPERATOR):
            if not user_org_id:
                return [], 0
            tenant_uuid = UUID(user_org_id)
            org = await self.org_repo.get_by_id(tenant_uuid)
            if not org:
                return [], 0
            return [org], 1

        items = await self.org_repo.list_all(offset=offset, limit=size)
        total = await self.org_repo.count_all()
        return items, total

    async def create_organization(self, data: OrganizationCreate) -> OrganizationModel:
        """Valida unicidade do slug, persiste no repositório e emite evento Outbox."""
        clean_slug = data.slug.strip().lower()
        existing = await self.org_repo.get_by_slug(clean_slug)
        if existing:
            raise ConflictError(
                f"Já existe uma organização cadastrada com o slug '{data.slug}'.",
                code="ORGANIZATION_SLUG_CONFLICT",
            )

        org = await self.org_repo.create(
            name=data.name,
            slug=clean_slug,
            contact_email=data.contact_email,
            contact_phone=data.contact_phone,
            tier=data.tier,
            sla_target_default=data.sla_target_default,
        )

        # Registra evento no Transactional Outbox
        event = OrganizationCreatedEvent(
            aggregate_id=org.id,
            organization_id=org.id,
            name=org.name,
            slug=org.slug,
            tier=org.tier,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="Organization")
        await self.session.commit()
        await self.session.refresh(org)
        return org
