"""Injeção de dependências de serviços para o contexto de SLA."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.sla.services.sla_service import SlaService
from src.core.config import get_settings
from src.core.web.dependencies import DbSessionDep
from src.integrations.glpi.client import GlpiClient


def get_glpi_client() -> GlpiClient | None:
    """Fábrica de injeção de dependência para o cliente da API do GLPI."""
    settings = get_settings()
    if not settings.GLPI_ENABLED or not settings.GLPI_BASE_URL:
        return None
    return GlpiClient(
        base_url=settings.GLPI_BASE_URL,
        app_token=settings.GLPI_APP_TOKEN,
        user_token=settings.GLPI_USER_TOKEN,
        timeout=settings.GLPI_TIMEOUT_SECONDS,
    )


async def get_sla_service(
    session: DbSessionDep,
    glpi_client: Annotated[GlpiClient | None, Depends(get_glpi_client)] = None,
) -> SlaService:
    """Provedor de dependência para instância de SlaService com cliente GLPI injetado."""
    return SlaService(uow_or_session=session, glpi_client=glpi_client)


SlaServiceDep = Annotated[SlaService, Depends(get_sla_service)]

__all__ = ["SlaServiceDep", "get_glpi_client", "get_sla_service"]
