"""Roteador principal agregador do contexto de SLA & Manutenção."""

from __future__ import annotations

from fastapi import APIRouter

from src.contexts.sla.api.routes.maintenance_windows import router as maintenance_windows_router
from src.contexts.sla.api.routes.sla import router as sla_router

router = APIRouter()
router.include_router(sla_router)
router.include_router(maintenance_windows_router)

__all__ = ["router"]
