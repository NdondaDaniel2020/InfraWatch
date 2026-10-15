"""Injeção de dependências FastAPI para os serviços de Telemetria."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.telemetry.services.heartbeat_service import HeartbeatService
from src.core.database.session import DbSessionDep


async def get_heartbeat_service(session: DbSessionDep) -> HeartbeatService:
    """Fábrica de injeção de dependência FastAPI para o HeartbeatService."""
    return HeartbeatService(session=session)


HeartbeatServiceDep = Annotated[HeartbeatService, Depends(get_heartbeat_service)]
