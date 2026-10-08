"""Serviço de Autenticação com proteção contra Timing Attack, MFA, Redefinição de Senha e Verificação."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.events import (
    AccountLockedEvent,
    EmailVerificationRequestedEvent,
    EmailVerifiedEvent,
    PasswordChangedEvent,
    PasswordResetCompletedEvent,
    PasswordResetRequestedEvent,
    UserLoggedInEvent,
)
from src.contexts.iam.database.models import UserModel
from src.contexts.iam.repositories.email_verification_repository import (
    EmailVerificationRepository,
)
from src.contexts.iam.repositories.password_reset_repository import (
    PasswordResetRepository,
)
from src.contexts.iam.repositories.refresh_token_repository import (
    RefreshTokenRepository,
)
from src.contexts.iam.repositories.user_repository import UserRepository
from src.contexts.iam.security.password import password_hasher
from src.contexts.iam.security.timing import constant_time_verify
from src.contexts.iam.security.tokens import (
    create_mfa_pending_token,
    decode_mfa_pending_token,
    generate_opaque_token,
)
from src.contexts.iam.services.auth_rate_limit_service import AuthRateLimitService
from src.contexts.iam.services.mfa_service import MfaService
from src.contexts.iam.services.token_service import (
    TokenPairResponse,
    TokenService,
)
from src.core.config import get_settings
from src.core.database.outbox_repository import OutboxRepository
from src.core.exceptions import (
    AccountLockedOutError,
    AuthenticationError,
    InvalidMfaChallengeError,
    InvalidMfaPendingTokenError,
    InvalidOrExpiredTokenError,
    TokenAlreadyUsedError,
)

logger = logging.getLogger(__name__)


def _ensure_utc(dt: datetime | None) -> datetime | None:
    """Garante que o datetime possua fuso horário UTC explicitamente definido."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


# Mensagem estritamente neutra para prevenir enumeração de contas
INVALID_CREDENTIALS_MSG = "Credenciais inválidas."


class AuthService:
    """Orquestrador do fluxo completo de autenticação, sessões, MFA e recuperação de senhas."""

    def __init__(
        self,
        session: AsyncSession,
        user_repository: UserRepository | None = None,
        token_service: TokenService | None = None,
        rate_limit_service: AuthRateLimitService | None = None,
    ) -> None:
        self.session = session
        self.user_repo = user_repository or UserRepository(session)
        self.token_service = token_service or TokenService(session)
        self.rate_limit_service = rate_limit_service or AuthRateLimitService()
        self.password_reset_repo = PasswordResetRepository(session)
        self.email_token_repo = EmailVerificationRepository(session)
        self.refresh_token_repo = RefreshTokenRepository(session)

    async def authenticate(
        self,
        email: str,
        password: str,
        *,
        client_ip: str = "127.0.0.1",
        user_agent: str | None = None,
        device_name: str | None = None,
    ) -> tuple[UserModel, TokenPairResponse | str]:
        """Autentica o usuário de forma neutra contra ataques de temporização.

        Se MFA estiver ativado, retorna (user, mfa_pending_token).
        Caso contrário, retorna (user, TokenPairResponse).
        """
        norm_email = email.strip().lower()

        # 1. Pré-checagem de bloqueios temporários
        await self.rate_limit_service.pre_login_check(client_ip=client_ip, email=norm_email)

        # 2. Busca do usuário pelo e-mail
        user = await self.user_repo.get_by_email(norm_email)

        # 3. Determinação do hash candidato para neutralidade temporal
        candidate_hash: str | None = None
        if user is not None and user.is_active:
            candidate_hash = user.hashed_password

        # Execução estritamente em tempo constante neutro
        is_password_valid = await constant_time_verify(candidate_hash, password)

        # 4. Falha na autenticação (usuário inexistente, inativo ou senha divergente)
        if not is_password_valid or user is None or not user.is_active:
            try:
                await self.rate_limit_service.register_failed_login(
                    client_ip=client_ip, email=norm_email
                )
            except AccountLockedOutError as lock_exc:
                if user is not None and user.is_active:
                    block_minutes = max(1, (lock_exc.retry_after or 900) // 60)
                    locked_event = AccountLockedEvent(
                        aggregate_id=user.id,
                        email=user.email,
                        block_minutes=block_minutes,
                    )
                    OutboxRepository.add_event(self.session, locked_event, aggregate_type="User")
                    await self.session.commit()
                raise
            logger.info(
                "Falha de autenticação para o identificador %s (IP: %s)", norm_email, client_ip
            )
            raise AuthenticationError(INVALID_CREDENTIALS_MSG)

        # 5. Sucesso na validação de senha -> reseta tentativas
        await self.rate_limit_service.register_successful_login(
            client_ip=client_ip, email=norm_email
        )

        # 6. Se MFA estiver ativo, emite token intermediário mfa_pending (3 min)
        if user.mfa_enabled:
            pending_token = create_mfa_pending_token(user.id)
            logger.info("Desafio de MFA exigido para usuário: %s", user.email)
            return user, pending_token

        # 7. Emissão final de tokens
        tokens = await self.token_service.create_token_pair(
            user=user,
            ip_address=client_ip,
            user_agent=user_agent,
            device_name=device_name,
        )

        event = UserLoggedInEvent(
            aggregate_id=user.id,
            user_id=user.id,
            email=user.email,
            ip_address=client_ip,
            user_agent=user_agent,
            organization_id=user.organization_id,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.commit()

        logger.info("Usuário autenticado com sucesso: %s (ID: %s)", user.email, user.id)
        return user, tokens

    async def authenticate_mfa_challenge(
        self,
        *,
        mfa_pending_token: str,
        code: str,
        client_ip: str = "127.0.0.1",
        user_agent: str | None = None,
        device_name: str | None = None,
    ) -> tuple[UserModel, TokenPairResponse]:
        """Valida o código TOTP ou de backup e emite o par final de tokens de sessão."""
        try:
            payload = decode_mfa_pending_token(mfa_pending_token)
        except Exception as exc:
            raise InvalidMfaPendingTokenError() from exc

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise InvalidMfaPendingTokenError()

        user_id = UUID(user_id_str)
        user = await self.user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise AuthenticationError(INVALID_CREDENTIALS_MSG)

        mfa_service = MfaService(self.session)
        is_valid = await mfa_service.verify_challenge(user.id, code)
        if not is_valid:
            raise InvalidMfaChallengeError()

        tokens = await self.token_service.create_token_pair(
            user=user,
            ip_address=client_ip,
            user_agent=user_agent,
            device_name=device_name,
        )

        event = UserLoggedInEvent(
            aggregate_id=user.id,
            user_id=user.id,
            email=user.email,
            ip_address=client_ip,
            user_agent=user_agent,
            organization_id=user.organization_id,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.commit()

        return user, tokens

    async def request_password_reset(
        self,
        email: str,
        *,
        client_ip: str | None = None,
    ) -> str | None:
        """Gera token de recuperação de senha se o usuário existir (resposta neutra).

        SEGURANÇA (ADR-022): O envio do e-mail é delegado ao barramento de eventos
        via Transactional Outbox, garantindo tempo de resposta constante (~10ms)
        independentemente da existência do e-mail no sistema.
        """
        norm_email = email.strip().lower()
        user = await self.user_repo.get_by_email(norm_email)
        if not user or not user.is_active:
            return None

        raw_token = generate_opaque_token(32)
        settings = get_settings()
        expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        )
        await self.password_reset_repo.create(
            user_id=user.id,
            token=raw_token,
            expires_at=expires_at,
        )

        event = PasswordResetRequestedEvent(
            aggregate_id=user.id,
            email=user.email,
            reset_token=raw_token,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.commit()
        return raw_token

    async def reset_password(
        self,
        *,
        token: str,
        new_password: str,
        client_ip: str | None = None,
    ) -> None:
        """Valida token de redefinição, atualiza a senha e invalida sessões antigas."""
        record = await self.password_reset_repo.get_by_token(token)
        if not record:
            raise InvalidOrExpiredTokenError()

        if record.used:
            raise TokenAlreadyUsedError()

        now = datetime.now(UTC)
        expires_at = _ensure_utc(record.expires_at)
        if expires_at is not None and expires_at <= now:
            raise InvalidOrExpiredTokenError("O link de redefinição de senha expirou.")

        user = await self.user_repo.get_by_id(record.user_id)
        if not user:
            raise InvalidOrExpiredTokenError()

        # Atualiza a senha
        user.hashed_password = password_hasher.hash(new_password)
        await self.password_reset_repo.mark_used(record, used_at=now)

        # Invalida todas as sessões anteriores por segurança
        await self.refresh_token_repo.revoke_other_sessions(user.id)

        # Emite eventos de notificação via Outbox (ADR-020)
        changed_event = PasswordChangedEvent(aggregate_id=user.id, email=user.email)
        completed_event = PasswordResetCompletedEvent(aggregate_id=user.id, email=user.email)
        OutboxRepository.add_event(self.session, changed_event, aggregate_type="User")
        OutboxRepository.add_event(self.session, completed_event, aggregate_type="User")

        await self.session.flush()
        await self.session.commit()

    async def verify_email(
        self,
        token: str,
        *,
        client_ip: str | None = None,
    ) -> None:
        """Confirma e valida o endereço de e-mail de um novo usuário."""
        record = await self.email_token_repo.get_by_token(token)
        if not record:
            raise InvalidOrExpiredTokenError()

        if record.used:
            raise TokenAlreadyUsedError()

        now = datetime.now(UTC)
        expires_at = _ensure_utc(record.expires_at)
        if expires_at is not None and expires_at <= now:
            raise InvalidOrExpiredTokenError("O link de verificação de e-mail expirou.")

        user = await self.user_repo.get_by_id(record.user_id)
        if not user:
            raise InvalidOrExpiredTokenError()

        user.is_verified = True
        await self.email_token_repo.mark_used(record, used_at=now)

        event = EmailVerifiedEvent(
            aggregate_id=user.id,
            email=user.email,
            full_name=user.full_name,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")

        await self.session.flush()
        await self.session.commit()

    async def resend_verification_email(
        self,
        email: str,
        *,
        client_ip: str | None = None,
    ) -> str | None:
        """Reenvia o link de verificação caso a conta não esteja confirmada."""
        norm_email = email.strip().lower()
        user = await self.user_repo.get_by_email(norm_email)
        if not user or user.is_verified:
            return None

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

        event = EmailVerificationRequestedEvent(
            aggregate_id=user.id,
            email=user.email,
            verify_token=raw_token,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.commit()
        return raw_token
