"""Ponto de entrada principal da aplicação FastAPI do InfraWatch."""

from typing import Any

from fastapi import Depends, FastAPI, Response

from src.contexts.iam.api.router import router as iam_router
from src.contexts.inventory.api.routes.devices import router as inventory_router
from src.core.config import get_settings
from src.core.web.lifespan import lifespan
from src.core.observability.metrics_auth import verify_metrics_auth
from src.core.observability.observability import (
    get_health_status,
    metrics_response,
)
from src.core.web.error_handlers import register_exception_handlers
from src.core.web.middleware import setup_middlewares


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

    # Inclusão do roteador principal do Bounded Context IAM
    app.include_router(iam_router)
    
    # Inclusão do roteador do Bounded Context Inventory
    app.include_router(inventory_router)

    @app.get(
        "/metrics",
        tags=["Observability"],
        include_in_schema=False,
        dependencies=[Depends(verify_metrics_auth)],
    )
    @app.get(
        "/api/v1/monitoring/metrics",
        tags=["Observability"],
        include_in_schema=False,
        dependencies=[Depends(verify_metrics_auth)],
    )
    async def metrics_endpoint() -> Response:
        """Endpoint de scraping em formato Prometheus protegido por Basic Auth (ADR-025)."""
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

__all__ = ["app", "create_app"]
