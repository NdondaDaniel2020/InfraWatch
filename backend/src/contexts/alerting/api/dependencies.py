"""Injeção de dependências FastAPI para o contexto de Alerting."""

from typing import Annotated

from fastapi import Depends

from src.contexts.alerting.services.incident_service import IncidentService
from src.core.database.unit_of_work import UnitOfWorkDep


def get_incident_service(uow: UnitOfWorkDep) -> IncidentService:
    """Instancia o IncidentService injetando a unidade de trabalho gerenciada."""
    return IncidentService(uow)


IncidentServiceDep = Annotated[IncidentService, Depends(get_incident_service)]
