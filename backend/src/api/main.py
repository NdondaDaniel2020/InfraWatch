"""Ponto de entrada principal da aplicação FastAPI do InfraWatch."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.middleware import TrustedProxyMiddleware
from src.api.routes.auth import router as auth_router
from src.api.routes.mfa import router as mfa_router
from src.api.routes.organizations import router as organizations_router
from src.api.routes.sse import router as sse_router
from src.api.routes.users import router as users_router
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

    # Sanitização e resolução segura do IP de clientes contra spoofing (ADR-023)
    app.add_middleware(TrustedProxyMiddleware)

    # Configuração de CORS permissivo para dashboards e clientes web autorizados
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Inclusão de rotas principais
    app.include_router(auth_router)
    app.include_router(mfa_router)
    app.include_router(users_router)
    app.include_router(organizations_router)
    app.include_router(sse_router)

    @app.get("/api/health", tags=["Health"])
    async def health_check() -> dict[str, str]:
        """Healthcheck básico de disponibilidade da API."""
        return {"status": "healthy", "service": "infrawatch-api"}

    return app


app = create_app()
