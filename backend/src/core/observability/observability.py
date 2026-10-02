"""Métricas operacionais Prometheus, instrumentação de latência e health checks profundos."""

from __future__ import annotations

import time
from typing import Any

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from src.core.database.session import get_session_factory

# Métricas canônicas do Prometheus
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total acumulado de requisições HTTP processadas.",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Distribuição da latência de respostas HTTP em segundos.",
    ["method", "endpoint"],
)

ACTIVE_REQUESTS = Gauge(
    "http_requests_active",
    "Contagem instantânea de requisições HTTP ativas no servidor.",
)

DB_CONNECTIONS = Gauge(
    "db_connections_active",
    "Contagem de conexões ativas no pool do banco de dados.",
)

DB_QUERY_LATENCY = Histogram(
    "db_query_duration_seconds",
    "Latência de consultas e comandos executados no banco de dados.",
    ["query_type"],
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware para coleta de métricas de tráfego, status HTTP e duração para Prometheus."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        ACTIVE_REQUESTS.inc()
        start_time = time.perf_counter()
        method = request.method
        path = request.url.path

        try:
            response = await call_next(request)
            status_code = str(response.status_code)
            return response
        except Exception:
            status_code = "500"
            raise
        finally:
            ACTIVE_REQUESTS.dec()
            elapsed = time.perf_counter() - start_time
            REQUEST_COUNT.labels(method=method, endpoint=path, status=status_code).inc()
            REQUEST_LATENCY.labels(method=method, endpoint=path).observe(elapsed)


async def get_health_status() -> dict[str, Any]:
    """Executa checagem de integridade profunda, incluindo conectividade com o PostgreSQL."""
    health: dict[str, Any] = {
        "status": "healthy",
        "service": "infrawatch-api",
        "checks": {},
    }

    try:
        session_factory = get_session_factory()
        async with session_factory() as session:
            await session.execute(text("SELECT 1"))
        health["checks"]["database"] = {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        health["checks"]["database"] = {
            "status": "fail",
            "error": str(exc),
        }
        health["status"] = "degraded"

    return health


def metrics_response() -> tuple[bytes, str]:
    """Gera o payload em formato Prometheus text-based e seu respectivo Content-Type."""
    return generate_latest(), CONTENT_TYPE_LATEST
