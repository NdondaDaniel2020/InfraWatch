"""Repositório assíncrono para operações de persistência de Organizações (OrganizationModel)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import OrganizationModel, UserModel
from src.contexts.iam.domain.enums import OrgTier


@dataclass(frozen=True)
class OrganizationInfo:
    """Visão de domínio para integração entre contextos sem vazamento de ORM."""

    id: UUID
    name: str
    slug: str
    sla_target_default: Decimal
    is_active: bool


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

    async def get_users_count_map(self, organization_ids: list[UUID]) -> dict[UUID, int]:
        """Calcula o total de usuários vinculados para cada organização informada."""
        if not organization_ids:
            return {}
        query = (
            select(UserModel.organization_id, func.count(UserModel.id))
            .where(UserModel.organization_id.in_(organization_ids))
            .group_by(UserModel.organization_id)
        )
        result = await self.session.execute(query)
        return {org_id: int(count) for org_id, count in result.all() if org_id is not None}

    async def get_name_by_id(self, organization_id: UUID) -> str | None:
        """Recupera o nome da organização pelo seu ID."""
        stmt = select(OrganizationModel.name).where(OrganizationModel.id == organization_id)
        result = await self.session.execute(stmt)
        val = result.scalar_one_or_none()
        if val is None:
            return None
        if isinstance(val, str):
            return val
        if hasattr(val, "name"):
            name_attr = getattr(val, "name")
            if isinstance(name_attr, str):
                return name_attr
        return None

    async def get_names_by_ids(self, organization_ids: list[UUID]) -> dict[UUID, str]:
        """Recupera mapeamento de id para nome para uma lista de organizações."""
        if not organization_ids:
            return {}
        stmt = select(OrganizationModel.id, OrganizationModel.name).where(
            OrganizationModel.id.in_(organization_ids)
        )
        result = await self.session.execute(stmt)
        rows_fn = getattr(result, "all", None)
        if callable(rows_fn):
            res_all = rows_fn()
            if isinstance(res_all, list) and res_all:
                if isinstance(res_all[0], (tuple, list)):
                    return {r[0]: r[1] for r in res_all}
                if hasattr(res_all[0], "id") and hasattr(res_all[0], "name"):
                    return {r.id: r.name for r in res_all}
        return {}

    async def get_info_by_id(self, organization_id: UUID) -> OrganizationInfo | None:
        """Recupera dados cadastrais essenciais da organização de forma desacoplada do ORM."""
        model = await self.get_by_id(organization_id)
        if not model:
            return None
        return OrganizationInfo(
            id=model.id,
            name=model.name,
            slug=model.slug,
            sla_target_default=model.sla_target_default,
            is_active=model.is_active,
        )


__all__ = ["OrganizationInfo", "OrganizationRepository"]
