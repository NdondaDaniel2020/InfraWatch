"""Serviço unificado de gestão e ciclo de vida de usuários (UserService).

Atua como fachada de conveniência integrando UserCommandService (escrita)
e UserQueryService (leitura) para manter total retrocompatibilidade arquitetural.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.domain.commands import (
    ActivateUserCommand,
    AdminDisableMfaCommand,
    ChangeUserRoleCommand,
    DeactivateUserCommand,
    RegisterUserCommand,
    UpdateProfileCommand,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.services.user_command_service import UserCommandService
from src.contexts.iam.services.user_query_service import UserQueryService
from src.core.database.unit_of_work import AbstractUnitOfWork


class UserService:
    """Fachada agregadora para comandos e consultas de usuários."""

    def __init__(
        self,
        uow_or_session: AbstractUnitOfWork | AsyncSession | None = None,
        session: AsyncSession | None = None,
    ) -> None:
        self._command_service = UserCommandService(uow_or_session, session=session)
        self._query_service = UserQueryService(self._command_service.session)

        # Exposição de propriedades para compatibilidade
        self.uow = self._command_service.uow
        self.session = self._command_service.session
        self.user_repo = self._command_service.user_repo
        self.email_token_repo = self._command_service.email_token_repo
        self.mfa_repo = self._command_service.mfa_repo
        self.refresh_token_repo = self._command_service.refresh_token_repo

    # -- Delegações de Comandos (UserCommandService) --

    async def register_user(
        self,
        cmd: RegisterUserCommand | None = None,
        *,
        email: str | None = None,
        password: str | None = None,
        full_name: str | None = None,
        organization_id: UUID | None = None,
        role: UserRole | str = UserRole.CLIENT_VIEWER,
    ) -> tuple[UserModel, str]:
        return await self._command_service.register_user(
            cmd,
            email=email,
            password=password,
            full_name=full_name,
            organization_id=organization_id,
            role=role,
        )

    async def update_profile(
        self,
        user_id: UUID,
        cmd: UpdateProfileCommand | None = None,
        *,
        full_name: str | None = None,
    ) -> UserModel:
        return await self._command_service.update_profile(
            user_id,
            cmd=cmd,
            full_name=full_name,
        )

    async def update_roles(
        self,
        user_id: UUID,
        role: UserRole | str | None = None,
        cmd: ChangeUserRoleCommand | None = None,
    ) -> UserModel:
        return await self._command_service.update_roles(
            user_id,
            role=role,
            cmd=cmd,
        )

    update_user_role = update_roles

    async def activate_user(
        self,
        user_id: UUID,
        cmd: ActivateUserCommand | None = None,
    ) -> UserModel:
        return await self._command_service.activate_user(user_id, cmd=cmd)

    async def deactivate_user(
        self,
        user_id: UUID,
        cmd: DeactivateUserCommand | None = None,
        *,
        reason: str | None = None,
    ) -> UserModel:
        return await self._command_service.deactivate_user(user_id, cmd=cmd, reason=reason)

    async def admin_disable_mfa(
        self,
        user_id: UUID,
        cmd: AdminDisableMfaCommand | None = None,
    ) -> UserModel:
        return await self._command_service.admin_disable_mfa(user_id, cmd=cmd)

    # -- Delegações de Consultas (UserQueryService) --

    async def get_user_by_id(self, user_id: UUID) -> UserModel:
        return await self._query_service.get_user_by_id(user_id)

    get_by_id = get_user_by_id

    async def get_user_by_email(self, email: str) -> UserModel | None:
        return await self._query_service.get_user_by_email(email)

    get_by_email = get_user_by_email

    async def list_users(
        self,
        *,
        organization_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[UserModel], int]:
        return await self._query_service.list_users(
            organization_id=organization_id,
            offset=offset,
            limit=limit,
        )


__all__ = ["UserService"]
