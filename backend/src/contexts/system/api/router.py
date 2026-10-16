"""Agregador de rotas da camada Web do Bounded Context System & Operations."""

from fastapi import APIRouter

from src.contexts.system.api.routes.backup import router as backup_router

router = APIRouter()

router.include_router(backup_router)

__all__ = ["router"]
