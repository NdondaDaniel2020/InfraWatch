"""Rotas REST para monitoramento passivo e ingestão de telemetria."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.contexts.telemetry.api.dependencies import HeartbeatServiceDep
from src.contexts.telemetry.schemas.heartbeat import (
    HeartbeatResponse,
    HeartbeatSignalRequest,
)
from src.contexts.telemetry.services.heartbeat_service import DeviceNotFoundError

router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitoring & Telemetry"])


@router.post(
    "/heartbeat/{device_id}",
    response_model=HeartbeatResponse,
    summary="Receber sinal de vida (Heartbeat Passivo) para cronjobs e rotinas batch",
)
async def receive_heartbeat(
    device_id: UUID,
    service: HeartbeatServiceDep,
    payload: HeartbeatSignalRequest | None = None,
) -> HeartbeatResponse:
    """Ingere batimento cardíaco passivo (RF-MON-01) emitido por cronjobs e processos em lote."""
    try:
        return await service.register_heartbeat(device_id=device_id, signal=payload)
    except DeviceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
