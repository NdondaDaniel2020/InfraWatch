"""Middlewares ASGI e HTTP da aplicação InfraWatch."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.middleware.correlation_id import CorrelationIDMiddleware
from src.api.middleware.request_logging import RequestLoggingMiddleware
from src.api.middleware.security_headers import SecurityHeadersMiddleware
from src.api.middleware.trusted_proxy import TrustedProxyMiddleware
from src.core.config import get_settings
from src.core.observability.observability import MetricsMiddleware


def setup_middlewares(app: FastAPI) -> None:
    """Registra todos os middlewares da aplicação na ordem correta de execução."""
    settings = get_settings()

    # 1. Métricas Prometheus no topo da cadeia
    app.add_middleware(MetricsMiddleware)

    # 2. Injeção de cabeçalhos de segurança defensivos
    app.add_middleware(SecurityHeadersMiddleware)

    # 3. Resolução segura de IP contra spoofing em proxies reversos
    app.add_middleware(TrustedProxyMiddleware)

    # 4. Configuração de CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.DEBUG else [settings.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 5. Registro de requisições e latência HTTP
    app.add_middleware(RequestLoggingMiddleware)

    # 6. Correlation ID (X-Request-ID) propagado nas requisições
    app.add_middleware(CorrelationIDMiddleware)


__all__ = [
    "CorrelationIDMiddleware",
    "RequestLoggingMiddleware",
    "SecurityHeadersMiddleware",
    "TrustedProxyMiddleware",
    "setup_middlewares",
]
