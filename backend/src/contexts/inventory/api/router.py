"""Roteador principal agregador do contexto de Inventário."""

from __future__ import annotations

from fastapi import APIRouter

from src.contexts.inventory.api.routes.devices import router as devices_router

router = APIRouter()
router.include_router(devices_router)

__all__ = ["router"]
