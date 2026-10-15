"""Agregador de rotas da camada Web do Bounded Context Telemetry."""

from fastapi import APIRouter

from src.contexts.telemetry.api.routes.monitoring import router as monitoring_router

router = APIRouter()

router.include_router(monitoring_router)

__all__ = ["router"]
