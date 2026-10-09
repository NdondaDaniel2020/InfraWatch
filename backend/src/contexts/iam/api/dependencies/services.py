"""Injeção de dependências para os Serviços de Aplicação do Bounded Context IAM.

Fábricas padronizadas para FastAPI Depends eliminando instanciamento manual nas rotas.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.iam.services.audit_service import AuditService
from src.contexts.iam.services.auth_service import AuthService
from src.contexts.iam.services.google_auth_service import GoogleAuthService
from src.contexts.iam.services.mfa_service import MfaService
from src.contexts.iam.services.notification_service import NotificationService
from src.contexts.iam.services.organization_service import OrganizationService
from src.contexts.iam.services.session_service import SessionService
from src.contexts.iam.services.token_service import TokenService
from src.contexts.iam.services.user_service import UserService
from src.core.database.session import DbSessionDep
from src.core.database.unit_of_work import UnitOfWorkDep


def get_user_service(uow: UnitOfWorkDep) -> UserService:
    """Fábrica de injeção para o UserService com Unit of Work."""
    return UserService(uow)


def get_auth_service(uow: UnitOfWorkDep) -> AuthService:
    """Fábrica de injeção para o AuthService com Unit of Work."""
    return AuthService(uow)


def get_session_service(db: DbSessionDep) -> SessionService:
    """Fábrica de injeção para o SessionService."""
    return SessionService(db)


def get_mfa_service(db: DbSessionDep) -> MfaService:
    """Fábrica de injeção para o MfaService."""
    return MfaService(db)


def get_token_service(db: DbSessionDep) -> TokenService:
    """Fábrica de injeção para o TokenService."""
    return TokenService(db)


def get_notification_service(db: DbSessionDep) -> NotificationService:
    """Fábrica de injeção para o NotificationService."""
    return NotificationService(db)


def get_organization_service(db: DbSessionDep) -> OrganizationService:
    """Fábrica de injeção para o OrganizationService."""
    return OrganizationService(db)


def get_audit_service(db: DbSessionDep) -> AuditService:
    """Fábrica de injeção para o AuditService."""
    return AuditService(db)


def get_google_auth_service(db: DbSessionDep) -> GoogleAuthService:
    """Fábrica de injeção para o GoogleAuthService."""
    return GoogleAuthService(db)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
SessionServiceDep = Annotated[SessionService, Depends(get_session_service)]
MfaServiceDep = Annotated[MfaService, Depends(get_mfa_service)]
TokenServiceDep = Annotated[TokenService, Depends(get_token_service)]
NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
OrganizationServiceDep = Annotated[OrganizationService, Depends(get_organization_service)]
AuditServiceDep = Annotated[AuditService, Depends(get_audit_service)]
GoogleAuthServiceDep = Annotated[GoogleAuthService, Depends(get_google_auth_service)]
