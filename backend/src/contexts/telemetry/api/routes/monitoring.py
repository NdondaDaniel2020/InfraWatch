"""Rotas REST para monitoramento passivo e ingestão de telemetria."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.schemas.heartbeat import (
    HeartbeatResponse,
    HeartbeatSignalRequest,
)
from src.core.database.session import DbSessionDep

router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitoring & Telemetry"])


@router.post(
    "/heartbeat/{device_id}",
    response_model=HeartbeatResponse,
    summary="Receber sinal de vida (Heartbeat Passivo) para cronjobs e rotinas batch",
)
async def receive_heartbeat(
    device_id: UUID,
    session: DbSessionDep,
    payload: HeartbeatSignalRequest | None = None,
) -> HeartbeatResponse:
    """Ingere batimento cardíaco passivo (RF-MON-01) emitido por cronjobs e processos em lote."""
    res = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = res.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dispositivo com id '{device_id}' não encontrado para recepção de heartbeat.",
        )

    now = datetime.now(UTC)
    reported_status = payload.status.upper() if payload and payload.status else "UP"
    metric_status = "UP" if reported_status in {"UP", "SUCCESS", "OK"} else "DEGRADED"
    duration = payload.duration_ms if payload and payload.duration_ms is not None else 0.0

    # 1. Registra ponto de dado na tabela particionada de métricas
    metric = MetricModel(
        device_id=device_id,
        organization_id=device.organization_id,
        metric_type="heartbeat",
        value=duration,
        packet_loss=0.0,
        status=metric_status,
        timestamp=now,
    )
    session.add(metric)

    # 2. Atualiza estado e último contato do dispositivo
    device.status = metric_status
    device.updated_at = now
    session.add(device)

    await session.commit()

    return HeartbeatResponse(
        status=metric_status,
        device_id=device_id,
        received_at=now,
        message=payload.message
        if payload and payload.message
        else "Heartbeat recebido e processado com sucesso.",
    )
