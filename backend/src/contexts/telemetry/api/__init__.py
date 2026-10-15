"""Camada de API REST do Bounded Context Telemetry."""

from src.contexts.telemetry.api.routes.monitoring import router as monitoring_router

__all__ = ["monitoring_router"]
