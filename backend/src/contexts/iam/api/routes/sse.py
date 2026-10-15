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
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser, CurrentUserDep
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.telemetry.database.models import MetricModel
from src.contexts.telemetry.schemas.telemetry import (
    MonitoredDeviceDetail,
    MonitoredDeviceItem,
    MonitoredDevicesResponse,
    TelemetryMetricPoint,
)
from src.core.database.session import DbSessionDep
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
    session: DbSessionDep,
    status_filter: str | None = Query(
        None, alias="status", description="Filtrar por status operacional"
    ),
    limit: int = Query(50, ge=1, le=200, description="Quantidade máxima de dispositivos"),
    offset: int = Query(0, ge=0, description="Offset de paginação"),
) -> MonitoredDevicesResponse:
    """Consulta REST dos ativos sob monitoramento com telemetria mais recente."""
    stmt = select(DeviceModel)

    # Isolamento multitenancy: usuários não-administradores só acessam sua própria organização
    if not current_user.is_super_admin:
        if current_user.organization_id:
            stmt = stmt.where(DeviceModel.organization_id == UUID(current_user.organization_id))
        else:
            return MonitoredDevicesResponse(total=0, items=[])

    if status_filter:
        stmt = stmt.where(DeviceModel.status == status_filter.upper())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await session.execute(count_stmt)).scalar_one() or 0

    stmt = stmt.order_by(DeviceModel.name.asc()).offset(offset).limit(limit)
    devices = (await session.execute(stmt)).scalars().all()

    if not devices:
        return MonitoredDevicesResponse(total=total_count, items=[])

    device_ids = [d.id for d in devices]

    # Busca a última métrica de cada dispositivo em lote
    latest_subq = (
        select(
            MetricModel.device_id,
            func.max(MetricModel.timestamp).label("max_ts"),
        )
        .where(MetricModel.device_id.in_(device_ids))
        .group_by(MetricModel.device_id)
        .subquery()
    )

    metrics_stmt = select(MetricModel).join(
        latest_subq,
        (MetricModel.device_id == latest_subq.c.device_id)
        & (MetricModel.timestamp == latest_subq.c.max_ts),
    )
    metrics_result = (await session.execute(metrics_stmt)).scalars().all()
    latencies_by_dev: dict[UUID, float] = {}
    losses_by_dev: dict[UUID, float] = {}
    timestamps_by_dev: dict[UUID, datetime] = {}
    fallback_metric_by_dev: dict[UUID, MetricModel] = {}

    for m in metrics_result:
        timestamps_by_dev[m.device_id] = m.timestamp
        fallback_metric_by_dev[m.device_id] = m
        if m.packet_loss is not None:
            losses_by_dev[m.device_id] = m.packet_loss
        if m.metric_type == "latency_ms":
            latencies_by_dev[m.device_id] = m.value
        elif m.metric_type == "packet_loss":
            losses_by_dev[m.device_id] = m.value

    items: list[MonitoredDeviceItem] = []
    for dev in devices:
        ts = timestamps_by_dev.get(dev.id)
        loss = losses_by_dev.get(dev.id)
        lat = latencies_by_dev.get(dev.id)
        if lat is None and dev.id in fallback_metric_by_dev:
            m = fallback_metric_by_dev[dev.id]
            if m.metric_type not in ("packet_loss", "cpu_quota", "cpu_period", "cpu_shares"):
                lat = m.value

        items.append(
            MonitoredDeviceItem(
                device_id=dev.id,
                organization_id=dev.organization_id,
                name=dev.name,
                ip_address=dev.ip_address,
                protocol=dev.protocol,
                category=dev.category,
                status=dev.status,
                is_paused=dev.is_paused,
                interval_seconds=dev.interval_seconds,
                last_latency_ms=lat,
                last_packet_loss=loss if loss is not None else (0.0 if ts else None),
                last_monitored_at=ts,
            )
        )

    return MonitoredDevicesResponse(total=total_count, items=items)


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
    session: DbSessionDep,
    metric_limit: int = Query(
        50, ge=1, le=200, description="Quantidade de pontos históricos a retornar"
    ),
) -> MonitoredDeviceDetail:
    """Consulta REST detalhada de telemetria por ativo."""
    stmt = select(DeviceModel).where(DeviceModel.id == device_id)
    device = (await session.execute(stmt)).scalar_one_or_none()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo não encontrado",
        )

    # Validação de isolamento multitenant
    if not current_user.can_access_organization(str(device.organization_id)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo não encontrado",
        )

    # Busca a série temporal recente de métricas para este dispositivo
    metrics_stmt = (
        select(MetricModel)
        .where(MetricModel.device_id == device_id)
        .order_by(MetricModel.timestamp.desc())
        .limit(metric_limit)
    )
    metric_rows = (await session.execute(metrics_stmt)).scalars().all()

    recent_metrics = [
        TelemetryMetricPoint(
            metric_type=m.metric_type,
            value=m.value,
            packet_loss=m.packet_loss,
            status=m.status,
            timestamp=m.timestamp,
        )
        for m in metric_rows
    ]

    last_latency = None
    last_packet_loss = None
    last_timestamp = None

    if metric_rows:
        last_timestamp = metric_rows[0].timestamp
        for m in metric_rows:
            if m.packet_loss is not None and last_packet_loss is None:
                last_packet_loss = m.packet_loss
            if m.metric_type == "latency_ms" and last_latency is None:
                last_latency = m.value
            elif m.metric_type == "packet_loss" and last_packet_loss is None:
                last_packet_loss = m.value

        if last_latency is None:
            for m in metric_rows:
                if m.metric_type not in ("packet_loss", "cpu_quota", "cpu_period", "cpu_shares"):
                    last_latency = m.value
                    break

    return MonitoredDeviceDetail(
        device_id=device.id,
        organization_id=device.organization_id,
        name=device.name,
        hostname=device.hostname,
        ip_address=device.ip_address,
        port=device.port,
        protocol=device.protocol,
        category=device.category,
        status=device.status,
        is_paused=device.is_paused,
        interval_seconds=device.interval_seconds,
        last_latency_ms=last_latency,
        last_packet_loss=last_packet_loss
        if last_packet_loss is not None
        else (0.0 if last_timestamp else None),
        last_monitored_at=last_timestamp,
        recent_metrics=recent_metrics,
    )
