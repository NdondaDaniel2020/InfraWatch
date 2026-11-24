"""Repositório assíncrono para operações de persistência de Usuários (UserModel)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.domain.aggregate import User
from src.contexts.iam.domain.enums import UserRole


class UserRepository:
    """Repositório de dados para a entidade UserModel."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _to_domain(self, model: UserModel) -> User:
        """Converte o modelo ORM UserModel no agregado de domínio User."""
        return User(
            id=model.id,
            email=model.email,
            hashed_password=model.hashed_password or "",
            full_name=model.full_name,
            role=model.role,
            organization_id=model.organization_id,
            is_active=model.is_active,
            is_verified=model.is_verified,
            mfa_enabled=getattr(model, "mfa_enabled", False),
            mfa_type=getattr(model, "mfa_type", None),
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def find_by_id(self, user_id: UUID) -> User | None:
        """Busca usuário por identificador único e retorna a entidade de domínio User."""
        model = await self.get_by_id(user_id)
        return self._to_domain(model) if model else None

    async def find_by_email(self, email: str) -> User | None:
        """Busca usuário por e-mail e retorna a entidade de domínio User."""
        model = await self.get_by_email(email)
        return self._to_domain(model) if model else None

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

    async def get_by_google_id(self, google_id: str) -> UserModel | None:
        """Busca usuário pela identidade federada única do Google (sub)."""
        query = (
            select(UserModel)
            .options(selectinload(UserModel.organization))
            .where(UserModel.google_id == google_id.strip())
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def save(self, user: User | UserModel) -> UserModel:
        """Persiste ou atualiza uma entidade de domínio User ou UserModel na sessão ativa."""
        if isinstance(user, User):
            model = await self.get_by_id(user.id)
            if not model:
                model = UserModel(
                    id=user.id,
                    email=user.email,
                    hashed_password=user.hashed_password,
                    full_name=user.full_name,
                    role=user.role,
                    organization_id=user.organization_id,
                    is_active=user.is_active,
                    is_verified=user.is_verified,
                )
                self.session.add(model)
            else:
                model.email = user.email
                model.hashed_password = user.hashed_password
                model.full_name = user.full_name
                model.role = user.role
                model.organization_id = user.organization_id
                model.is_active = user.is_active
                model.is_verified = user.is_verified
                model.mfa_enabled = user.mfa_enabled
                model.mfa_type = user.mfa_type
                model.updated_at = user.updated_at
            await self.session.flush()
            return model

        self.session.add(user)
        await self.session.flush()
        return user

    async def create(
        self,
        *,
        email: str,
        full_name: str,
        hashed_password: str | None = None,
        role: str | UserRole = UserRole.CLIENT_VIEWER,
        organization_id: UUID | None = None,
        is_active: bool = True,
        is_verified: bool = False,
        oauth_provider: str | None = None,
        google_id: str | None = None,
    ) -> UserModel:
        """Cria e persiste um novo usuário no banco de dados (conveniência para save)."""
        user = UserModel(
            email=email.strip().lower(),
            hashed_password=hashed_password,
            full_name=full_name.strip(),
            role=str(role),
            organization_id=organization_id,
            is_active=is_active,
            is_verified=is_verified,
            oauth_provider=oauth_provider,
            google_id=google_id,
        )
        return await self.save(user)

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

    async def list_paginated(
        self,
        *,
        organization_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
        load_organization: bool = True,
    ) -> tuple[list[UserModel], int]:
        """Lista usuários paginados com filtro opcional por tenant e retorna a contagem total."""
        query = select(UserModel)
        if load_organization:
            query = query.options(joinedload(UserModel.organization))
        count_query = select(func.count()).select_from(UserModel)

        if organization_id is not None:
            query = query.where(UserModel.organization_id == organization_id)
            count_query = count_query.where(UserModel.organization_id == organization_id)

        query = query.order_by(UserModel.created_at.desc()).offset(offset).limit(limit)
        items_res = await self.session.execute(query)
        count_res = await self.session.execute(count_query)

        return list(items_res.scalars().all()), int(count_res.scalar_one())

    async def set_active_status(self, user_id: UUID, is_active: bool) -> None:
        """Atualiza o estado de ativação do usuário."""
        statement = update(UserModel).where(UserModel.id == user_id).values(is_active=is_active)
        await self.session.execute(statement)
        await self.session.flush()
