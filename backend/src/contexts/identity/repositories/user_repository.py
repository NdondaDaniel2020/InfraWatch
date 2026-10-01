"""Repositório assíncrono para operações de persistência de Usuários (UserModel)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.contexts.identity.domain.enums import UserRole
from src.contexts.identity.domain.models import UserModel


class UserRepository:
    """Repositório de dados para a entidade UserModel."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: UUID) -> UserModel | None:
        """Busca usuário por identificador único com carregamento antecipado de organização."""
        query = (
            select(UserModel)
            .options(selectinload(UserModel.organization))
            .where(UserModel.id == user_id)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> UserModel | None:
        """Busca usuário por endereço de e-mail (case-insensitive)."""
        query = (
            select(UserModel)
            .options(selectinload(UserModel.organization))
            .where(UserModel.email == email.strip().lower())
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        email: str,
        hashed_password: str,
        full_name: str,
        role: str | UserRole = UserRole.CLIENT_VIEWER,
        organization_id: UUID | None = None,
        is_active: bool = True,
    ) -> UserModel:
        """Cria e persiste um novo usuário no banco de dados."""
        user = UserModel(
            email=email.strip().lower(),
            hashed_password=hashed_password,
            full_name=full_name.strip(),
            role=str(role),
            organization_id=organization_id,
            is_active=is_active,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def list_by_organization(
        self,
        organization_id: UUID | None = None,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[UserModel]:
        """Lista usuários com suporte a filtro opcional por tenant e paginação determinística."""
        query = select(UserModel).order_by(UserModel.created_at.asc()).offset(offset).limit(limit)
        if organization_id is not None:
            query = query.where(UserModel.organization_id == organization_id)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_by_organization(self, organization_id: UUID | None = None) -> int:
        """Retorna contagem total de usuários para cálculo de paginação."""
        query = select(func.count()).select_from(UserModel)
        if organization_id is not None:
            query = query.where(UserModel.organization_id == organization_id)

        result = await self.session.execute(query)
        return int(result.scalar_one())

    async def set_active_status(self, user_id: UUID, is_active: bool) -> None:
        """Atualiza o estado de ativação do usuário."""
        statement = update(UserModel).where(UserModel.id == user_id).values(is_active=is_active)
        await self.session.execute(statement)
        await self.session.flush()
