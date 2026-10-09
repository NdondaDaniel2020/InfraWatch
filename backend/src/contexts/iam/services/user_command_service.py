"""Serviço de Aplicação para Comandos de Usuário (UserCommandService - CQRS/CQS).

Responsável por todas as operações de escrita, mutação de estado e orquestração
transacional via Unit of Work para o domínio de usuários do IAM.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.domain.aggregate import User
from src.contexts.iam.domain.commands import (
    ActivateUserCommand,
    AdminDisableMfaCommand,
    ChangeUserRoleCommand,
    DeactivateUserCommand,
    RegisterUserCommand,
    UpdateProfileCommand,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.events import (
    AccountDeactivatedEvent,
    EmailVerificationRequestedEvent,
    ProfileUpdatedEvent,
    RolesChangedEvent,
)
from src.contexts.iam.repositories.email_verification_repository import (
    EmailVerificationRepository,
)
from src.contexts.iam.repositories.mfa_repository import MfaRepository
from src.contexts.iam.repositories.refresh_token_repository import (
    RefreshTokenRepository,
)
from src.contexts.iam.repositories.user_repository import UserRepository
from src.contexts.iam.security.password import password_hasher
from src.contexts.iam.security.tokens import generate_opaque_token
from src.core.config import get_settings
from src.core.database.outbox_repository import OutboxRepository
from src.core.database.unit_of_work import AbstractUnitOfWork, SqlAlchemyUnitOfWork
from src.core.exceptions import (
    EmailAlreadyExistsError,
    NotFoundError,
)


class UserCommandService:
    """Serviço de mutação e orquestração de comandos para contas de usuários."""

    def __init__(
        self,
        uow_or_session: AbstractUnitOfWork | AsyncSession | None = None,
        session: AsyncSession | None = None,
        user_repository: UserRepository | None = None,
    ) -> None:
        target = uow_or_session if uow_or_session is not None else session
        if target is None:
            raise ValueError("uow_or_session or session is required")

        if isinstance(target, AbstractUnitOfWork):
            self.uow = target
            self.session = target.session
        else:
            self.session = target
            self.uow = SqlAlchemyUnitOfWork(session=target)

        self.user_repo = user_repository or UserRepository(self.session)
        self.email_token_repo = EmailVerificationRepository(self.session)
        self.mfa_repo = MfaRepository(self.session)
        self.refresh_token_repo = RefreshTokenRepository(self.session)

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
        """Cadastra novo usuário, gera token de verificação e insere evento no outbox."""
        req_email = (cmd.email if cmd else email) or ""
        req_pwd = (cmd.password if cmd else password) or ""
        req_name = (cmd.full_name if cmd else full_name) or ""
        req_org = cmd.organization_id if cmd else organization_id
        req_role = cmd.role if cmd else role

        norm_email = req_email.strip().lower()
        existing = await self.user_repo.get_by_email(norm_email)
        if existing:
            raise EmailAlreadyExistsError()

        hashed_pwd = password_hasher.hash(req_pwd)

        # Validação de invariantes através do agregado User
        aggregate_user = User(
            id=UUID(int=0),  # temporário antes da persistência
            email=norm_email,
            hashed_password=hashed_pwd,
            full_name=req_name,
            role=req_role,
            organization_id=req_org,
            is_active=True,
        )

        user_model = UserModel(
            email=aggregate_user.email,
            hashed_password=aggregate_user.hashed_password,
            full_name=aggregate_user.full_name,
            role=str(aggregate_user.role),
            organization_id=aggregate_user.organization_id,
            is_active=aggregate_user.is_active,
        )
        saved_user = await self.user_repo.save(user_model)

        # Gera token de ativação/verificação de e-mail (parametrizado via Settings)
        raw_token = generate_opaque_token(32)
        settings = get_settings()
        expires_at = datetime.now(UTC) + timedelta(
            hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS
        )
        await self.email_token_repo.create(
            user_id=saved_user.id,
            token=raw_token,
            expires_at=expires_at,
        )

        event = EmailVerificationRequestedEvent(
            aggregate_id=saved_user.id,
            email=saved_user.email,
            verify_token=raw_token,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.flush()
        await self.session.refresh(saved_user)

        return saved_user, raw_token

    async def update_profile(
        self,
        user_id: UUID,
        cmd: UpdateProfileCommand | None = None,
        *,
        full_name: str | None = None,
    ) -> UserModel:
        """Atualiza dados cadastrais do perfil e notifica o usuário via evento."""
        target_name = (cmd.full_name if cmd and cmd.full_name is not None else full_name)
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        changed_fields: list[str] = []
        if target_name is not None and user.full_name != target_name.strip():
            user.full_name = target_name.strip()
            changed_fields.append("Nome Completo")

        await self.session.flush()
        await self.session.refresh(user)

        if changed_fields:
            event = ProfileUpdatedEvent(
                aggregate_id=user.id,
                email=user.email,
                changed_fields=", ".join(changed_fields),
            )
            OutboxRepository.add_event(self.session, event, aggregate_type="User")
            await self.session.flush()

        return user

    async def update_roles(
        self,
        user_id: UUID,
        role: UserRole | str | None = None,
        cmd: ChangeUserRoleCommand | None = None,
    ) -> UserModel:
        """Atualiza papel/role RBAC de um usuário e emite evento de notificação."""
        target_role = cmd.role if cmd else role
        if target_role is None:
            raise ValueError("O papel de usuário (role) é obrigatório.")

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        role_str = str(target_role.value if isinstance(target_role, UserRole) else target_role)
        old_role = str(user.role)
        user.role = role_str
        await self.session.flush()
        await self.session.refresh(user)

        if old_role != role_str:
            event = RolesChangedEvent(
                aggregate_id=user.id,
                email=user.email,
                new_roles=role_str,
            )
            OutboxRepository.add_event(self.session, event, aggregate_type="User")
            await self.session.flush()

        return user

    update_user_role = update_roles

    async def activate_user(
        self,
        user_id: UUID,
        cmd: ActivateUserCommand | None = None,
    ) -> UserModel:
        """Ativa a conta do usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.is_active = True
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def deactivate_user(
        self,
        user_id: UUID,
        cmd: DeactivateUserCommand | None = None,
        *,
        reason: str | None = None,
    ) -> UserModel:
        """Suspende a conta do usuário, revoga sessões e notifica por e-mail."""
        effective_reason = (
            (cmd.reason if cmd and cmd.reason else reason)
            or "Suspensão administrativa por conformidade de segurança"
        )
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.is_active = False
        await self.refresh_token_repo.revoke_other_sessions(user_id)
        event = AccountDeactivatedEvent(
            aggregate_id=user.id,
            email=user.email,
            reason=effective_reason,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def admin_disable_mfa(
        self,
        user_id: UUID,
        cmd: AdminDisableMfaCommand | None = None,
    ) -> UserModel:
        """Desativação administrativa de emergência do MFA de um usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        method = await self.mfa_repo.get_active_by_user_and_type(user_id, type="totp")
        if method:
            await self.mfa_repo.deactivate_method(method)

        user.mfa_enabled = False
        user.mfa_type = None
        await self.session.flush()
        await self.session.refresh(user)
        return user


__all__ = ["UserCommandService"]
