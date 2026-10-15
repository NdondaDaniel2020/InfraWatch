"""Injeção de dependências FastAPI para os serviços de Alerting."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.alerting.services.incident_service import IncidentService
from src.core.config import get_settings
from src.core.database.unit_of_work import UnitOfWorkDep
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


def get_incident_service(
    uow: UnitOfWorkDep,
    glpi_client: Annotated[GlpiClient | None, Depends(get_glpi_client)] = None,
) -> IncidentService:
    """Instancia o IncidentService injetando a unidade de trabalho e cliente GLPI."""
    return IncidentService(uow_or_session=uow, glpi_client=glpi_client)


IncidentServiceDep = Annotated[IncidentService, Depends(get_incident_service)]
