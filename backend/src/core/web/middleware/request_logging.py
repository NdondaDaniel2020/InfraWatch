"""Middleware de registro de requisições e latência HTTP com métricas de tempo de execução."""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from src.core.observability.context import get_request_id

logger = logging.getLogger("infrawatch.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Mede e registra latência, status HTTP e identificador do cliente para cada requisição."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start_time = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start_time

        client_host = request.client.host if request.client else "unknown"
        request_id = get_request_id()

        logger.info(
            "HTTP request completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(elapsed * 1000, 2),
                "client_host": client_host,
                "request_id": request_id,
            },
        )
        return response
