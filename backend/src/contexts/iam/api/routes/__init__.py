"""Rotas HTTP da camada Web do Bounded Context IAM."""

from src.contexts.iam.api.routes.audit import router as audit_router
from src.contexts.iam.api.routes.auth import router as auth_router
from src.contexts.iam.api.routes.google_auth import router as google_auth_router
from src.contexts.iam.api.routes.mfa import router as mfa_router
from src.contexts.iam.api.routes.notifications import router as notifications_router
from src.contexts.iam.api.routes.organizations import router as organizations_router
from src.contexts.iam.api.routes.sse import router as sse_router
from src.contexts.iam.api.routes.users import router as users_router

__all__ = [
    "audit_router",
    "auth_router",
    "google_auth_router",
    "mfa_router",
    "notifications_router",
    "organizations_router",
    "sse_router",
    "users_router",
]
