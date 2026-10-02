import os

file_path = "/spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/contexts/iam/services/auth_service.py"
with open(file_path, "r") as f:
    content = f.read()

# 4a. Update imports
content = content.replace(
    "from src.contexts.iam.domain.events import UserLoggedInEvent",
    "from src.contexts.iam.domain.events import (\n    AccountLockedEvent,\n    EmailVerificationRequestedEvent,\n    EmailVerifiedEvent,\n    PasswordChangedEvent,\n    PasswordResetCompletedEvent,\n    PasswordResetRequestedEvent,\n    UserLoggedInEvent,\n)"
)

content = content.replace(
    "from src.contexts.iam.services.email_service import EmailService\nfrom src.contexts.iam.services.email_service import email_service as default_email_service\n",
    ""
)

# 4b. Remove email_service from __init__
init_old = """    def __init__(
        self,
        session: AsyncSession,
        user_repository: UserRepository | None = None,
        token_service: TokenService | None = None,
        rate_limit_service: AuthRateLimitService | None = None,
        email_service: EmailService | None = None,
    ) -> None:
        self.session = session
        self.user_repo = user_repository or UserRepository(session)
        self.token_service = token_service or TokenService(session)
        self.rate_limit_service = rate_limit_service or AuthRateLimitService()
        self.email_service = email_service or default_email_service
        self.password_reset_repo = PasswordResetRepository(session)
        self.email_token_repo = EmailVerificationRepository(session)
        self.refresh_token_repo = RefreshTokenRepository(session)"""

init_new = """    def __init__(
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
        self.refresh_token_repo = RefreshTokenRepository(session)"""

content = content.replace(init_old, init_new)

# 4c. Replace account locked email call
lock_old = "                    await self.email_service.send_account_locked_email(user.email, block_minutes)"
lock_new = """                    locked_event = AccountLockedEvent(
                        aggregate_id=user.id,
                        email=user.email,
                        block_minutes=block_minutes,
                    )
                    OutboxRepository.add_event(self.session, locked_event, aggregate_type="User")
                    await self.session.commit()"""
content = content.replace(lock_old, lock_new)

# 4d. Replace MFA service instantiation
mfa_old = "        mfa_service = MfaService(self.session, email_service=self.email_service)"
mfa_new = "        mfa_service = MfaService(self.session)"
content = content.replace(mfa_old, mfa_new)

# 4e. Replace request_password_reset
req_old = """    async def request_password_reset(
        self,
        email: str,
        *,
        client_ip: str | None = None,
    ) -> str | None:
        \"\"\"Gera token de recuperação de senha se o usuário existir (resposta neutra).\"\"\"
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
        await self.email_service.send_password_reset_email(user.email, raw_token)
        await self.session.commit()
        return raw_token"""
req_new = """    async def request_password_reset(
        self,
        email: str,
        *,
        client_ip: str | None = None,
    ) -> str | None:
        \"\"\"Gera token de recuperação de senha se o usuário existir (resposta neutra).

        SEGURANÇA (ADR-022): O envio do e-mail é delegado ao barramento de eventos
        via Transactional Outbox, garantindo tempo de resposta constante (~10ms)
        independentemente da existência do e-mail no sistema.
        \"\"\"
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
        return raw_token"""
content = content.replace(req_old, req_new)

# 4f. Replace reset_password
res_old = """    async def reset_password(
        self,
        *,
        token: str,
        new_password: str,
        client_ip: str | None = None,
    ) -> None:
        \"\"\"Valida token de redefinição, atualiza a senha e invalida sessões antigas.\"\"\"
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
        await self.session.flush()
        await self.session.commit()

        await self.email_service.send_password_changed_email(user.email)
        await self.email_service.send_password_reset_completed_email(user.email)"""
res_new = """    async def reset_password(
        self,
        *,
        token: str,
        new_password: str,
        client_ip: str | None = None,
    ) -> None:
        \"\"\"Valida token de redefinição, atualiza a senha e invalida sessões antigas.\"\"\"
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
        await self.session.commit()"""
content = content.replace(res_old, res_new)

# 4g. Replace verify_email
ver_old = """    async def verify_email(
        self,
        token: str,
        *,
        client_ip: str | None = None,
    ) -> None:
        \"\"\"Confirma e valida o endereço de e-mail de um novo usuário.\"\"\"
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
        await self.session.flush()
        await self.session.commit()

        await self.email_service.send_welcome_email(user.email, user.full_name)"""
ver_new = """    async def verify_email(
        self,
        token: str,
        *,
        client_ip: str | None = None,
    ) -> None:
        \"\"\"Confirma e valida o endereço de e-mail de um novo usuário.\"\"\"
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
        await self.session.commit()"""
content = content.replace(ver_old, ver_new)

# 4h. Replace resend_verification_email
resend_old = """    async def resend_verification_email(
        self,
        email: str,
        *,
        client_ip: str | None = None,
    ) -> str | None:
        \"\"\"Reenvia o link de verificação caso a conta não esteja confirmada.\"\"\"
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
        await self.session.commit()
        await self.email_service.send_verification_email(user.email, raw_token)
        return raw_token"""
resend_new = """    async def resend_verification_email(
        self,
        email: str,
        *,
        client_ip: str | None = None,
    ) -> str | None:
        \"\"\"Reenvia o link de verificação caso a conta não esteja confirmada.\"\"\"
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
        return raw_token"""
content = content.replace(resend_old, resend_new)

with open(file_path, "w") as f:
    f.write(content)
