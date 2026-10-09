"""Serviço de Aplicação para Consultas de Usuário (UserQueryService - CQRS/CQS).

Responsável por consultas otimizadas de leitura, listagens paginadas e
recuperação de perfis de usuário, sem mutação de estado transacional.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.repositories.user_repository import UserRepository
from src.core.exceptions import NotFoundError


class UserQueryService:
    """Serviço de consultas e recuperação de contas de usuários."""

    def __init__(
        self,
        session: AsyncSession,
        user_repository: UserRepository | None = None,
    ) -> None:
        self.session = session
        self.user_repo = user_repository or UserRepository(session)

    async def get_user_by_id(self, user_id: UUID) -> UserModel:
        """Busca usuário pelo seu identificador primário UUID."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")
        return user

    get_by_id = get_user_by_id

    async def get_user_by_email(self, email: str) -> UserModel | None:
        """Busca usuário de forma exata pelo e-mail normalizado."""
        return await self.user_repo.get_by_email(email.strip().lower())

    get_by_email = get_user_by_email

    async def list_users(
        self,
        *,
        organization_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[UserModel], int]:
        """Lista usuários paginados com filtro opcional por organização/tenant."""
        query = select(UserModel)
        count_query = select(func.count()).select_from(UserModel)

        if organization_id is not None:
            query = query.where(UserModel.organization_id == organization_id)
            count_query = count_query.where(UserModel.organization_id == organization_id)

        query = query.order_by(UserModel.created_at.desc()).offset(offset).limit(limit)
        items_res = await self.session.execute(query)
        count_res = await self.session.execute(count_query)

        return list(items_res.scalars().all()), int(count_res.scalar_one())


__all__ = ["UserQueryService"]
