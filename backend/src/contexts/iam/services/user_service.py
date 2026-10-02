"""Serviço de gestão e ciclo de vida de usuários (UserService)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.models import UserModel
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
from src.contexts.iam.services.email_service import EmailService
from src.contexts.iam.services.email_service import email_service as default_email_service
from src.core.config import get_settings
from src.core.exceptions import (
    EmailAlreadyExistsError,
    NotFoundError,
)


class UserService:
    """Serviço de domínio para gestão e ciclo de vida de contas de usuários."""

    def __init__(
        self,
        session: AsyncSession,
        email_service: EmailService | None = None,
    ) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.email_token_repo = EmailVerificationRepository(session)
        self.mfa_repo = MfaRepository(session)
        self.refresh_token_repo = RefreshTokenRepository(session)
        self.email_service = email_service or default_email_service

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

        # Gera token de ativação/verificação de e-mail (parametrizado via Settings)
        raw_token = generate_opaque_token(32)
        settings = get_settings()
        expires_at = datetime.now(UTC) + timedelta(
            hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS
        )
        await self.email_token_repo.create(
            user_id=user.id,
            token=raw_token,
            expires_at=expires_at,
        )

        await self.email_service.send_verification_email(user.email, raw_token)
        await self.session.commit()
        await self.session.refresh(user)

        return user, raw_token

    async def update_profile(
        self,
        user_id: UUID,
        *,
        full_name: str | None = None,
    ) -> UserModel:
        """Atualiza dados cadastrais do perfil e notifica o usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        changed_fields: list[str] = []
        if full_name is not None and user.full_name != full_name.strip():
            user.full_name = full_name.strip()
            changed_fields.append("Nome Completo")

        await self.session.flush()
        await self.session.commit()
        await self.session.refresh(user)

        if changed_fields:
            await self.email_service.send_profile_updated_email(
                user.email,
                changed_fields=changed_fields,
            )

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
        """Atualiza papel/role RBAC de um usuário e envia notificação."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        role_str = str(role.value if isinstance(role, UserRole) else role)
        old_role = str(user.role)
        user.role = role_str
        await self.session.flush()
        await self.session.commit()
        await self.session.refresh(user)

        if old_role != role_str:
            await self.email_service.send_roles_changed_email(user.email, new_roles=[role_str])

        return user

    update_user_role = update_roles

    async def activate_user(self, user_id: UUID) -> UserModel:
        """Ativa a conta do usuário."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.is_active = True
        await self.session.flush()
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def deactivate_user(
        self,
        user_id: UUID,
        *,
        reason: str = "Suspensão administrativa por conformidade de segurança",
    ) -> UserModel:
        """Suspende a conta do usuário, revoga sessões e notifica por e-mail."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("Usuário não encontrado.")

        user.is_active = False
        await self.refresh_token_repo.revoke_other_sessions(user_id)
        await self.session.flush()
        await self.session.commit()
        await self.session.refresh(user)
        await self.email_service.send_account_deactivated_email(user.email, reason=reason)
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
        await self.session.commit()
        await self.session.refresh(user)
        return user
