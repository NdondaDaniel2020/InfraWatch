"""Repositório de persistência assíncrono para o agregado Incident."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.alerting.domain.incident import Incident, IncidentStatus


class IncidentRepository:
    """Implementação concreta de acesso e persistência para Incident."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, incident_id: UUID) -> Incident | None:
        """Busca um incidente pelo seu identificador único."""
        stmt = select(IncidentModel).where(IncidentModel.id == incident_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return model.to_domain() if model else None

    async def save(self, incident: Incident) -> Incident:
        """Persiste uma nova ocorrência ou atualiza um incidente existente."""
        stmt = select(IncidentModel).where(IncidentModel.id == incident.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if model is None:
            model = IncidentModel.from_domain(incident)
            self._session.add(model)
        else:
            model.update_from_domain(incident)

        await self._session.flush()
        return model.to_domain()

    async def list_incidents(
        self,
        organization_id: UUID | None = None,
        status: str | None = None,
        device_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Incident], int]:
        """Consulta incidentes com filtros e paginação retornando os registros e o total."""
        query = select(IncidentModel)
        count_query = select(func.count(IncidentModel.id))

        if organization_id is not None:
            query = query.where(IncidentModel.organization_id == organization_id)
            count_query = count_query.where(IncidentModel.organization_id == organization_id)

        if status is not None:
            query = query.where(IncidentModel.status == status)
            count_query = count_query.where(IncidentModel.status == status)

        if device_id is not None:
            query = query.where(IncidentModel.device_id == device_id)
            count_query = count_query.where(IncidentModel.device_id == device_id)

        # Ordenação cronológica decrescente (mais recentes primeiro)
        query = query.order_by(IncidentModel.started_at.desc()).limit(limit).offset(offset)

        total_res = await self._session.execute(count_query)
        total = total_res.scalar_one() or 0

        res = await self._session.execute(query)
        models = res.scalars().all()
        return [m.to_domain() for m in models], total

    async def find_open_by_device(self, device_id: UUID) -> Incident | None:
        """Localiza incidente aberto ou em atendimento para um dispositivo específico."""
        stmt = (
            select(IncidentModel)
            .where(
                IncidentModel.device_id == device_id,
                IncidentModel.status.in_([
                    IncidentStatus.TRIGGERED.value,
                    IncidentStatus.ACKNOWLEDGED.value,
                ]),
            )
            .order_by(IncidentModel.started_at.desc())
            .limit(1)
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return model.to_domain() if model else None
