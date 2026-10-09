"""Repositório assíncrono para operações de persistência de Organizações (OrganizationModel)."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.enums import OrgTier
from src.contexts.iam.database.models import OrganizationModel


class OrganizationRepository:
    """Repositório de dados para a entidade OrganizationModel."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, organization_id: UUID) -> OrganizationModel | None:
        """Busca organização por ID único."""
        return await self.session.get(OrganizationModel, organization_id)

    async def get_by_slug(self, slug: str) -> OrganizationModel | None:
        """Busca organização por slug único normalizado."""
        query = select(OrganizationModel).where(OrganizationModel.slug == slug.strip().lower())
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def save(self, organization: OrganizationModel) -> OrganizationModel:
        """Persiste ou atualiza uma organização na sessão ativa."""
        self.session.add(organization)
        await self.session.flush()
        return organization

    async def create(
        self,
        *,
        name: str,
        slug: str,
        contact_email: str | None = None,
        contact_phone: str | None = None,
        sla_target_default: Decimal = Decimal("99.50"),
        tier: str | OrgTier = OrgTier.STANDARD,
        is_active: bool = True,
    ) -> OrganizationModel:
        """Cria e persiste uma nova organização / tenant (conveniência para save)."""
        org = OrganizationModel(
            name=name.strip(),
            slug=slug.strip().lower(),
            contact_email=contact_email.strip() if contact_email else None,
            contact_phone=contact_phone.strip() if contact_phone else None,
            sla_target_default=sla_target_default,
            tier=str(tier),
            is_active=is_active,
        )
        return await self.save(org)


    async def list_all(self, *, offset: int = 0, limit: int = 50) -> list[OrganizationModel]:
        """Lista organizações ativas ou inativas com paginação."""
        query = (
            select(OrganizationModel)
            .order_by(OrganizationModel.name.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_all(self) -> int:
        """Contagem total de organizações."""
        query = select(func.count()).select_from(OrganizationModel)
        result = await self.session.execute(query)
        return int(result.scalar_one())


__all__ = ["OrganizationRepository"]
