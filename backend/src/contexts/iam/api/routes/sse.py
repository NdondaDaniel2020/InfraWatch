"""Rotas da API para streaming de eventos em tempo real via Server-Sent Events (SSE) e consultas REST de telemetria.

Disponibiliza:
- Canal unidirecional SSE de alta performance sobre HTTP/1.1 e HTTP/2 (ADR-004)
- Headers otimizados para proxies reversos (Nginx X-Accel-Buffering: no)
- Heartbeat periódico de keep-alive a cada 15s (: ping)
- Endpoints REST para hidratação de interfaces (Hydrate & Stream) e inspeção de dados monitorados
- Isolamento estrito de multitenancy por organização
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser, CurrentUserDep
from src.contexts.telemetry.api.dependencies import TelemetryQueryServiceDep
from src.contexts.telemetry.schemas.telemetry import (
    MonitoredDeviceDetail,
    MonitoredDevicesResponse,
)
from src.contexts.telemetry.services.telemetry_query_service import (
    TelemetryDeviceNotFoundError,
)
from src.core.messaging.sse_broadcaster import get_sse_broadcaster

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/events", tags=["Events & Telemetry Stream"])


async def sse_event_stream_generator(
    user: AuthenticatedUser,
    ping_interval_seconds: float = 15.0,
    last_event_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Generator assíncrono que produz eventos formatados em SSE a partir da fila do cliente.

    Emite mensagens conforme a especificação WHATWG EventSource:
    - Eventos regulares: event: ...\nid: ...\ndata: {...}\n\n
    - Heartbeat keep-alive: : ping\n\n
    """
    broadcaster = get_sse_broadcaster()
    connection_id, queue = await broadcaster.connect(user)

    logger.debug(
        "Iniciando streaming SSE para usuário %s (conn_id=%s, last_event_id=%s)",
        user.id,
        connection_id,
        last_event_id,
    )

    try:
        # Handshake inicial para estabelecer conexão imediata com o cliente
        yield ": connected\n\n"

        while True:
            try:
                # Aguarda o próximo evento na fila com timeout correspondente ao heartbeat
                payload = await asyncio.wait_for(
                    queue.get(),
                    timeout=ping_interval_seconds,
                )
                queue.task_done()

                event_type = str(payload.get("event_type", "message"))
                event_id = str(payload.get("event_id", ""))
                data_str = json.dumps(payload)

                yield f"event: {event_type}\nid: {event_id}\ndata: {data_str}\n\n"
            except TimeoutError:
                # Heartbeat keep-alive para evitar encerramento prematuro em proxies
                yield ": ping\n\n"
    except (asyncio.CancelledError, GeneratorExit):
        logger.debug("Streaming SSE cancelado ou desconectado pelo cliente (%s).", connection_id)
    finally:
        # Garante desconexão e liberação de recursos
        await broadcaster.disconnect(connection_id)


@router.get(
    "/stream",
    response_class=StreamingResponse,
    summary="Canal Server-Sent Events (SSE) de telemetria e alarmes em tempo real",
    description=(
        "Conexão HTTP streaming contínua que envia eventos de telemetria, mudanças de estado de ativos "
        "e incidentes em tempo real. Suporta autenticação via Bearer token ou query param '?token='."
    ),
)
async def stream_events(
    request: Request,
    current_user: CurrentUserDep,
    last_event_id_header: str | None = Header(None, alias="Last-Event-ID"),
    last_event_id_query: str | None = Query(None, alias="last_event_id"),
    ping_interval: float = Query(default=15.0, alias="ping_interval", ge=0.01, le=60.0),
) -> StreamingResponse:
    """Endpoint principal de streaming SSE com controle de isolamento e keep-alive."""
    effective_last_event_id = last_event_id_header or last_event_id_query

    headers = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(
        sse_event_stream_generator(
            user=current_user,
            ping_interval_seconds=ping_interval,
            last_event_id=effective_last_event_id,
        ),
        media_type="text/event-stream",
        headers=headers,
    )


@router.get(
    "/telemetry",
    response_model=MonitoredDevicesResponse,
    summary="Listar dados consolidados de dispositivos monitorados",
    description=(
        "Retorna a relação de todos os dispositivos monitorados e seu último estado de telemetria "
        "coletado (latência, perda de pacotes e status de saúde)."
    ),
)
@router.get(
    "/monitored",
    response_model=MonitoredDevicesResponse,
    include_in_schema=False,
)
async def list_monitored_telemetry(
    current_user: CurrentUserDep,
    query_service: TelemetryQueryServiceDep,
    status_filter: str | None = Query(
        None, alias="status", description="Filtrar por status operacional"
    ),
    limit: int = Query(50, ge=1, le=200, description="Quantidade máxima de dispositivos"),
    offset: int = Query(0, ge=0, description="Offset de paginação"),
) -> MonitoredDevicesResponse:
    """Consulta REST dos ativos sob monitoramento com telemetria mais recente."""
    return await query_service.list_monitored_devices(
        current_user=current_user,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/telemetry/{device_id}",
    response_model=MonitoredDeviceDetail,
    summary="Consultar telemetria de um dispositivo específico",
    description="Retorna os detalhes cadastrais e a série temporal recente de métricas coletadas para o dispositivo.",
)
@router.get(
    "/devices/{device_id}",
    response_model=MonitoredDeviceDetail,
    include_in_schema=False,
)
async def get_device_telemetry(
    device_id: UUID,
    current_user: CurrentUserDep,
    query_service: TelemetryQueryServiceDep,
    metric_limit: int = Query(
        50, ge=1, le=200, description="Quantidade de pontos históricos a retornar"
    ),
) -> MonitoredDeviceDetail:
    """Consulta REST detalhada de telemetria por ativo."""
    try:
        return await query_service.get_monitored_device_detail(
            device_id=device_id,
            current_user=current_user,
            metric_limit=metric_limit,
        )
    except TelemetryDeviceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err


__all__ = ["router"]
