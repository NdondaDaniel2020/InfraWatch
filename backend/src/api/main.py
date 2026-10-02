"""Ponto de entrada principal da aplicação FastAPI do InfraWatch."""

from typing import Any

from fastapi import FastAPI, Response

from src.api.middleware import setup_middlewares
from src.api.routes.audit import router as audit_router
from src.api.routes.auth import router as auth_router
from src.api.routes.mfa import router as mfa_router
from src.api.routes.notifications import router as notifications_router
from src.api.routes.organizations import router as organizations_router
from src.api.routes.sse import router as sse_router
from src.api.routes.users import router as users_router
from src.core.config import get_settings
from src.core.error_handlers import register_exception_handlers
from src.core.lifespan import lifespan
from src.core.observability.observability import (
    get_health_status,
    metrics_response,
)


def create_app() -> FastAPI:
    """Instancia e configura a aplicação FastAPI com lifespan, middlewares, rotas e observabilidade."""
    settings = get_settings()

    app = FastAPI(
        title="InfraWatch API",
        version="0.1.0",
        description=(
            "Plataforma de Observabilidade e NOC com Telemetria em Tempo Real, "
            "Gestão Automatizada de Incidentes GLPI e Monitoramento de SLA."
        ),
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    # Registro ordenado de middlewares e exception handlers
    setup_middlewares(app)
    register_exception_handlers(app)

    # Inclusão de rotas principais
    app.include_router(auth_router)
    app.include_router(mfa_router)
    app.include_router(users_router)
    app.include_router(organizations_router)
    app.include_router(notifications_router)
    app.include_router(sse_router)
    app.include_router(audit_router)

    @app.get("/metrics", tags=["Observability"], include_in_schema=False)
    async def metrics_endpoint() -> Response:
        """Endpoint de scraping em formato Prometheus."""
        data, content_type = metrics_response()
        return Response(content=data, media_type=content_type)

    @app.get("/api/health", tags=["Health"], summary="Health check profundo de disponibilidade")
    async def health_check() -> dict[str, Any]:
        """Health check profundo de disponibilidade da API e conectividade com banco de dados."""
        return await get_health_status()

    @app.get("/api/live", tags=["Health"], include_in_schema=False)
    async def liveness_probe() -> dict[str, str]:
        """Liveness probe simples para orquestradores (Kubernetes / Docker)."""
        return {"status": "alive"}

    return app


app = create_app()
