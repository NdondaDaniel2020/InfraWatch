"""Serviço de aplicação para ingestão e processamento de Heartbeat Passivo (RF-MON-01)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.schemas.heartbeat import (
    HeartbeatResponse,
    HeartbeatSignalRequest,
)
from src.core.database.session import DbSessionDep


class DeviceNotFoundError(Exception):
    """Lançada quando o dispositivo alvo do sinal de vida não é encontrado."""


class HeartbeatService:
    """Orquestra a ingestão de sinais de vida e persistência de telemetria passiva."""

    def __init__(
        self,
        session: AsyncSession,
        device_repo: DeviceRepository | None = None,
    ) -> None:
        self._session = session
        self._device_repo = device_repo or DeviceRepository(session)

    async def register_heartbeat(
        self,
        device_id: UUID,
        signal: HeartbeatSignalRequest | None = None,
    ) -> HeartbeatResponse:
        """Processa e persiste o sinal de batimento cardíaco para rotinas batch e cronjobs."""
        device = await self._device_repo.get_by_id(device_id)
        if device is None:
            raise DeviceNotFoundError(
                f"Dispositivo com id '{device_id}' não encontrado para recepção de heartbeat."
            )

        now = datetime.now(UTC)
        reported_status = signal.status.upper() if signal and signal.status else "UP"
        metric_status = "UP" if reported_status in {"UP", "SUCCESS", "OK"} else "DEGRADED"
        duration = signal.duration_ms if signal and signal.duration_ms is not None else 0.0

        # 1. Registra o ponto de métrica na tabela de telemetria
        metric = MetricModel(
            device_id=device_id,
            organization_id=device.organization_id,
            metric_type="heartbeat",
            value=duration,
            packet_loss=0.0,
            status=metric_status,
            timestamp=now,
        )
        self._session.add(metric)

        # 2. Atualiza estado e timestamp do dispositivo no inventário
        device.status = metric_status
        device.updated_at = now
        self._session.add(device)

        await self._session.commit()

        message = (
            signal.message
            if signal and signal.message
            else "Heartbeat recebido e processado com sucesso."
        )

        return HeartbeatResponse(
            status=metric_status,
            device_id=device_id,
            received_at=now,
            message=message,
        )


async def get_heartbeat_service(session: DbSessionDep) -> HeartbeatService:
    """Fábrica de injeção de dependência FastAPI para o HeartbeatService."""
    return HeartbeatService(session=session)


HeartbeatServiceDep = Annotated[HeartbeatService, Depends(get_heartbeat_service)]
