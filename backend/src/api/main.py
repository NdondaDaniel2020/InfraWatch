"""Ponto de entrada principal da aplicação FastAPI do InfraWatch."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes.sse import router as sse_router
from src.core.config import get_settings


def create_app() -> FastAPI:
    """Instancia e configura a aplicação FastAPI com rotas e middlewares essenciais."""
    settings = get_settings()

    app = FastAPI(
        title="InfraWatch API",
        version="0.1.0",
        description=(
            "Plataforma de Observabilidade e NOC com Telemetria em Tempo Real, "
            "Gestão Automatizada de Incidentes GLPI e Monitoramento de SLA."
        ),
        debug=settings.DEBUG,
    )

    # Configuração de CORS permissivo para dashboards e clientes web autorizados
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Inclusão de rotas principais
    app.include_router(sse_router)

    @app.get("/api/health", tags=["Health"])
    async def health_check() -> dict[str, str]:
        """Healthcheck básico de disponibilidade da API."""
        return {"status": "healthy", "service": "infrawatch-api"}

    return app


app = create_app()
