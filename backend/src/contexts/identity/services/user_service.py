"""Serviço de gestão e ciclo de vida de usuários (UserService)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.identity.domain.enums import UserRole
from src.contexts.identity.domain.models import UserModel
from src.contexts.identity.repositories.email_verification_repository import (
    EmailVerificationRepository,
)
from src.contexts.identity.repositories.mfa_repository import MfaRepository
from src.contexts.identity.repositories.refresh_token_repository import (
    RefreshTokenRepository,
)
from src.contexts.identity.repositories.user_repository import UserRepository
from src.contexts.identity.security.password import password_hasher
from src.contexts.identity.security.tokens import generate_opaque_token
from src.core.exceptions import (
    EmailAlreadyExistsError,
    NotFoundError,
)


class UserService:
    """Serviço de domínio para gestão e ciclo de vida de contas de usuários."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.email_token_repo = EmailVerificationRepository(session)
        self.mfa_repo = MfaRepository(session)
        self.refresh_token_repo = RefreshTokenRepository(session)

    async def register_user(
        self,
        *,
        email: str,
        password: str,
        full_name: str,
        organization_id: UUID | None = None,
        role: UserRole | str = UserRole.CLIENT_VIEWER,
    ) -> tuple[UserModel, str]:
        """Cadastra novo usuário, gera token de verificação de e-mail e salva no banco."""
        norm_email = email.strip().lower()
        existing = await self.user_repo.get_by_email(norm_email)
        if existing:
            raise EmailAlreadyExistsError()

        hashed_pwd = password_hasher.hash(password)
        user = await self.user_repo.create(
            email=norm_email,
            hashed_password=hashed_pwd,
            full_name=full_name.strip(),
            role=role,
            organization_id=organization_id,
            is_active=True,
        )

        # Gera token de ativação/verificação de e-mail (válido por 24h)
        raw_token = generate_opaque_token(32)
        expires_at = datetime.now(UTC) + timedelta(hours=24)
        await self.email_token_repo.create(
            user_id=user.id,
            token=raw_token,
            expires_at=expires_at,
        )

        return user, raw_token

    async def update_profile(
        self,
        user_id: UUID,
        *,
        full_name: str | None = None,
    ) -> UserModel:
        """Atualiza dados cadastrais do perfil."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        if full_name is not None:
            user.full_name = full_name.strip()

        await self.session.flush()
        return user

    async def get_user_by_id(self, user_id: UUID) -> UserModel:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")
        return user

    get_by_id = get_user_by_id

    async def list_users(
        self,
        *,
        organization_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[UserModel], int]:
        """Lista usuários paginados com filtro opcional por tenant."""
        query = select(UserModel)
        count_query = select(func.count()).select_from(UserModel)

        if organization_id is not None:
            query = query.where(UserModel.organization_id == organization_id)
            count_query = count_query.where(UserModel.organization_id == organization_id)

        query = query.order_by(UserModel.created_at.desc()).offset(offset).limit(limit)
        items_res = await self.session.execute(query)
        count_res = await self.session.execute(count_query)

        return list(items_res.scalars().all()), int(count_res.scalar_one())

    async def update_roles(self, user_id: UUID, role: UserRole | str) -> UserModel:
        """Atualiza papel/role RBAC de um usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.role = str(role)
        await self.session.flush()
        return user

    update_user_role = update_roles

    async def activate_user(self, user_id: UUID) -> UserModel:
        """Ativa a conta do usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.is_active = True
        await self.session.flush()
        return user

    async def deactivate_user(self, user_id: UUID) -> UserModel:
        """Suspende a conta do usuário e revoga todas as suas sessões ativas."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.is_active = False
        await self.refresh_token_repo.revoke_other_sessions(user_id)
        await self.session.flush()
        return user

    async def admin_disable_mfa(self, user_id: UUID) -> UserModel:
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
        return user
