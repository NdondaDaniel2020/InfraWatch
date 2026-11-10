"""Injeção de dependências FastAPI para resolução e validação de escopo de incidentes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status

from src.contexts.alerting.api.dependencies.services import IncidentServiceDep
from src.contexts.alerting.domain.exceptions import IncidentNotFoundError
from src.contexts.alerting.domain.incident import Incident
from src.contexts.iam.api.dependencies import CurrentUserDep


async def get_scoped_incident(
    incident_id: UUID,
    user: CurrentUserDep,
    service: IncidentServiceDep,
) -> Incident:
    """Recupera o incidente por ID e valida isolamento multi-tenant (prevenção BOLA/IDOR)."""
    try:
        incident = await service.get_incident(incident_id)
    except IncidentNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err

    if not user.is_global_operator:
        incident_org = getattr(incident, "organization_id", None)
        if (
            not user.organization_id
            or not incident_org
            or str(incident_org) != str(user.organization_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso não autorizado ao incidente deste tenant.",
            )

    return incident


ScopedIncidentDep = Annotated[Incident, Depends(get_scoped_incident)]

__all__ = [
    "ScopedIncidentDep",
    "get_scoped_incident",
]
