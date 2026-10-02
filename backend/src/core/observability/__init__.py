"""Módulo de observabilidade, telemetria, contexto e logs do InfraWatch."""

from src.core.observability.context import (
    get_request_id,
    get_user_id,
    request_id_ctx,
    set_request_id,
    set_user_id,
    user_id_ctx,
)
from src.core.observability.logging import (
    JSONFormatter,
    get_logger,
    setup_logging,
)
from src.core.observability.metrics_auth import verify_metrics_auth
from src.core.observability.observability import (
    MetricsMiddleware,
    get_health_status,
    metrics_response,
)

__all__ = [
    "JSONFormatter",
    "MetricsMiddleware",
    "get_health_status",
    "get_logger",
    "get_request_id",
    "get_user_id",
    "metrics_response",
    "request_id_ctx",
    "set_request_id",
    "set_user_id",
    "setup_logging",
    "user_id_ctx",
    "verify_metrics_auth",
]
