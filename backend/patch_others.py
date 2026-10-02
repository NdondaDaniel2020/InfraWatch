import os

user_file = "/spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/contexts/iam/services/user_service.py"
with open(user_file, "r") as f:
    content = f.read()

# 5a. Update imports
content = content.replace(
    "from src.contexts.iam.services.email_service import EmailService\nfrom src.contexts.iam.services.email_service import email_service as default_email_service\n",
    ""
)
content = content.replace(
    "from src.core.config import get_settings",
    "from src.contexts.iam.domain.events import (\n    AccountDeactivatedEvent,\n    EmailVerificationRequestedEvent,\n    ProfileUpdatedEvent,\n    RolesChangedEvent,\n)\nfrom src.core.config import get_settings\nfrom src.core.database.outbox_repository import OutboxRepository"
)

# 5b. Remove email_service from __init__
init_old = """    def __init__(
        self,
        session: AsyncSession,
        email_service: EmailService | None = None,
    ) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.email_token_repo = EmailVerificationRepository(session)
        self.mfa_repo = MfaRepository(session)
        self.refresh_token_repo = RefreshTokenRepository(session)
        self.email_service = email_service or default_email_service"""
init_new = """    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.email_token_repo = EmailVerificationRepository(session)
        self.mfa_repo = MfaRepository(session)
        self.refresh_token_repo = RefreshTokenRepository(session)"""
content = content.replace(init_old, init_new)

# 5c. Replace register_user email call
reg_old = """        await self.email_service.send_verification_email(user.email, raw_token)
        await self.session.commit()"""
reg_new = """        event = EmailVerificationRequestedEvent(
            aggregate_id=user.id,
            email=user.email,
            verify_token=raw_token,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.commit()"""
content = content.replace(reg_old, reg_new)

# 5d. Replace update_profile email call
upd_old = """        if changed_fields:
            await self.email_service.send_profile_updated_email(
                user.email,
                changed_fields=changed_fields,
            )"""
upd_new = """        if changed_fields:
            event = ProfileUpdatedEvent(
                aggregate_id=user.id,
                email=user.email,
                changed_fields=", ".join(changed_fields),
            )
            OutboxRepository.add_event(self.session, event, aggregate_type="User")
            await self.session.commit()"""
content = content.replace(upd_old, upd_new)

# 5e. Replace update_roles email call
rol_old = """        if old_role != role_str:
            await self.email_service.send_roles_changed_email(user.email, new_roles=[role_str])"""
rol_new = """        if old_role != role_str:
            event = RolesChangedEvent(
                aggregate_id=user.id,
                email=user.email,
                new_roles=role_str,
            )
            OutboxRepository.add_event(self.session, event, aggregate_type="User")
            await self.session.commit()"""
content = content.replace(rol_old, rol_new)

# 5f. Replace deactivate_user email call
deact_old = "        await self.email_service.send_account_deactivated_email(user.email, reason=reason)"
deact_new = """        event = AccountDeactivatedEvent(
            aggregate_id=user.id,
            email=user.email,
            reason=reason,
        )
        OutboxRepository.add_event(self.session, event, aggregate_type="User")
        await self.session.commit()"""
content = content.replace(deact_old, deact_new)

with open(user_file, "w") as f:
    f.write(content)

# MFA SERVICE
mfa_file = "/spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/contexts/iam/services/mfa_service.py"
with open(mfa_file, "r") as f:
    mfa_content = f.read()

# 6a. Update imports
mfa_content = mfa_content.replace(
    "from src.contexts.iam.services.email_service import EmailService\nfrom src.contexts.iam.services.email_service import email_service as default_email_service\n",
    ""
)
mfa_content = mfa_content.replace(
    "from src.contexts.iam.security.tokens import hash_token",
    "from src.contexts.iam.domain.events import BackupCodeUsedEvent\nfrom src.contexts.iam.security.tokens import hash_token\nfrom src.core.database.outbox_repository import OutboxRepository"
)

# 6b. Remove email_service from __init__
mfa_init_old = """    def __init__(
        self,
        session: AsyncSession,
        email_service: EmailService | None = None,
    ) -> None:
        self.session = session
        self.mfa_repo = MfaRepository(session)
        self.user_repo = UserRepository(session)
        self.email_service = email_service or default_email_service"""
mfa_init_new = """    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session
        self.mfa_repo = MfaRepository(session)
        self.user_repo = UserRepository(session)"""
mfa_content = mfa_content.replace(mfa_init_old, mfa_init_new)

# 6c. Replace backup code email call in verify_challenge
bc_old = """            user = await self.user_repo.get_by_id(user_id)
            if user:
                await self.email_service.send_backup_code_used_email(user.email, remaining)"""
bc_new = """            user = await self.user_repo.get_by_id(user_id)
            if user:
                event = BackupCodeUsedEvent(
                    aggregate_id=user.id,
                    email=user.email,
                    remaining_count=remaining,
                )
                OutboxRepository.add_event(self.session, event, aggregate_type="User")"""
mfa_content = mfa_content.replace(bc_old, bc_new)

with open(mfa_file, "w") as f:
    f.write(mfa_content)

# INIT SERVICE
init_file = "/spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/contexts/iam/services/__init__.py"
with open(init_file, "r") as f:
    init_content = f.read()

init_content = init_content.replace(
    "from src.contexts.iam.services.email_service import EmailService, email_service",
    "from src.contexts.iam.services.email_service import EmailService"
)
init_content = init_content.replace(
    '    "email_service",\n',
    ""
)

with open(init_file, "w") as f:
    f.write(init_content)

