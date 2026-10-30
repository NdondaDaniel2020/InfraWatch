"""Roteador principal agregador do contexto de Sistema e Infraestrutura."""

from __future__ import annotations

from fastapi import APIRouter

from src.contexts.system.api.routes.backup import router as backup_router
from src.contexts.system.api.routes.settings import router as settings_router

router = APIRouter()
router.include_router(backup_router)
router.include_router(settings_router)

__all__ = ["router"]
