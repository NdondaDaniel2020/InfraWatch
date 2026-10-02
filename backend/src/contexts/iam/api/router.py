"""Agregador de rotas da camada Web do Bounded Context IAM."""

from fastapi import APIRouter

from src.contexts.iam.api.routes.audit import router as audit_router
from src.contexts.iam.api.routes.auth import router as auth_router
from src.contexts.iam.api.routes.google_auth import router as google_auth_router
from src.contexts.iam.api.routes.mfa import router as mfa_router
from src.contexts.iam.api.routes.notifications import router as notifications_router
from src.contexts.iam.api.routes.organizations import router as organizations_router
from src.contexts.iam.api.routes.sse import router as sse_router
from src.contexts.iam.api.routes.users import router as users_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(google_auth_router)
router.include_router(mfa_router)
router.include_router(users_router)
router.include_router(organizations_router)
router.include_router(notifications_router)
router.include_router(sse_router)
router.include_router(audit_router)

__all__ = ["router"]
