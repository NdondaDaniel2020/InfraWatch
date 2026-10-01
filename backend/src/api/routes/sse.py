"""Rotas da API para streaming de eventos em tempo real via Server-Sent Events (SSE).

Disponibiliza canal unidirecional de alta performance com:
- StreamingResponse nativo sobre HTTP/1.1 e HTTP/2 (ADR-004)
- Headers otimizados para proxies reversos (Nginx X-Accel-Buffering: no)
- Heartbeat periódico de keep-alive a cada 15s (: ping)
- Isolamento estrito de multitenancy por organização
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import StreamingResponse

from src.api.dependencies.auth import AuthenticatedUser, SSECurrentUserDep
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
    - Eventos regulares: event: ...\\nid: ...\\ndata: {...}\\n\\n
    - Heartbeat keep-alive: : ping\\n\\n
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
    current_user: SSECurrentUserDep,
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
