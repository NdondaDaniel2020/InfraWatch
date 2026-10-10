"""Dependências FastAPI para injeção do contexto de SLA."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.sla.services.sla_service import SlaService
from src.core.database.session import DbSessionDep


async def get_sla_service(session: DbSessionDep) -> SlaService:
    """Provedor de dependência para instância de SlaService."""
    return SlaService(uow_or_session=session)


SlaServiceDep = Annotated[SlaService, Depends(get_sla_service)]
