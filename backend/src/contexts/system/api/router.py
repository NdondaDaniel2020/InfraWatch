"""Roteador principal agregador do contexto de Sistema e Infraestrutura."""

from __future__ import annotations

from fastapi import APIRouter

from src.contexts.system.api.routes.backup import router as backup_router

router = APIRouter()
router.include_router(backup_router)

__all__ = ["router"]
