"""Injeção de dependências FastAPI para os serviços de Telemetria."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.telemetry.services.heartbeat_service import HeartbeatService
from src.contexts.telemetry.services.telemetry_query_service import TelemetryQueryService
from src.core.web.dependencies import DbSessionDep


async def get_heartbeat_service(session: DbSessionDep) -> HeartbeatService:
    """Fábrica de injeção de dependência FastAPI para o HeartbeatService."""
    return HeartbeatService(session=session)


async def get_telemetry_query_service(session: DbSessionDep) -> TelemetryQueryService:
    """Fábrica de injeção de dependência FastAPI para o TelemetryQueryService."""
    return TelemetryQueryService(session=session)


HeartbeatServiceDep = Annotated[HeartbeatService, Depends(get_heartbeat_service)]
TelemetryQueryServiceDep = Annotated[TelemetryQueryService, Depends(get_telemetry_query_service)]

__all__ = [
    "HeartbeatServiceDep",
    "TelemetryQueryServiceDep",
    "get_heartbeat_service",
    "get_telemetry_query_service",
]
