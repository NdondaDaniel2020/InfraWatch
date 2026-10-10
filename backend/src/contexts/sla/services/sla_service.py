"""Serviço de aplicação para cálculo de disponibilidade (SLA) e Janelas de Manutenção."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.sla.database.repository import MaintenanceWindowRepository
from src.contexts.sla.domain.calculator import calculate_sla
from src.contexts.sla.domain.models import DowntimePeriod, MaintenanceWindow
from src.contexts.sla.schemas.requests import (
    CreateMaintenanceWindowRequest,
    UpdateMaintenanceWindowRequest,
)
from src.contexts.sla.schemas.responses import SlaReportResponse
from src.core.database.unit_of_work import AbstractUnitOfWork

logger = logging.getLogger("infrawatch.sla.service")


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


class SlaService:
    """Serviço de aplicação para orquestração analítica de SLA e gestão de janelas."""

    def __init__(self, uow_or_session: AbstractUnitOfWork | AsyncSession) -> None:
        if isinstance(uow_or_session, AbstractUnitOfWork):
            self._uow: AbstractUnitOfWork | None = uow_or_session
            self._session: AsyncSession = uow_or_session.session
        else:
            self._uow = None
            self._session = uow_or_session

        self._repo = MaintenanceWindowRepository(self._session)

    async def _commit(self) -> None:
        """Garante a consolidação ACID da transação corrente."""
        if self._uow is not None:
            await self._uow.commit()
        else:
            await self._session.commit()

    async def calculate_device_sla(
        self,
        device_id: UUID,
        start_period: datetime | None = None,
        end_period: datetime | None = None,
        sla_target: float = 99.50,
    ) -> SlaReportResponse:
        """Calcula a disponibilidade SLA de um dispositivo em janela deslizante ou período fixo."""
        now = datetime.now(UTC)
        end_utc = _ensure_utc(end_period) or now
        start_utc = _ensure_utc(start_period) or (end_utc - timedelta(days=30))

        if end_utc <= start_utc:
            raise ValueError("O horário final do período deve ser posterior ao horário inicial.")

        # 1. Recupera ocorrências de indisponibilidade (incidentes) que intersectam o intervalo
        stmt = (
            select(IncidentModel)
            .where(IncidentModel.device_id == device_id)
            .where(IncidentModel.started_at < end_utc)
            .where(
                or_(
                    IncidentModel.resolved_at.is_(None),
                    IncidentModel.resolved_at > start_utc,
                )
            )
        )
        res = await self._session.execute(stmt)
        incidents = res.scalars().all()

        downtime_periods: list[DowntimePeriod] = []
        for inc in incidents:
            inc_start = _ensure_utc(inc.started_at) or inc.started_at
            inc_resolved = _ensure_utc(inc.resolved_at) or end_utc
            downtime_periods.append(
                DowntimePeriod(
                    start_time=inc_start,
                    end_time=inc_resolved,
                    incident_id=inc.id,
                )
            )

        # 2. Localiza janelas de manutenção aprovadas aplicáveis ao dispositivo no período
        maintenance_windows = await self._repo.find_overlapping(
            start_time=start_utc,
            end_time=end_utc,
            device_id=device_id,
            approved_only=True,
        )

        # 3. Executa a fórmula analítica contratual com isenção
        result = calculate_sla(
            start_period=start_utc,
            end_period=end_utc,
            downtime_periods=downtime_periods,
            maintenance_windows=maintenance_windows,
            device_id=device_id,
        )

        return SlaReportResponse.from_calculation(result, sla_target=sla_target)

    async def create_maintenance_window(
        self, req: CreateMaintenanceWindowRequest
    ) -> MaintenanceWindow:
        """Cadastra uma nova janela de manutenção programada."""
        window = MaintenanceWindow(
            start_time=req.start_time,
            end_time=req.end_time,
            description=req.description,
            device_id=req.device_id,
            organization_id=req.organization_id,
            is_approved=req.is_approved,
        )
        saved = await self._repo.save(window)
        await self._commit()
        return saved

    async def get_maintenance_window(self, window_id: UUID) -> MaintenanceWindow | None:
        """Busca uma janela de manutenção por identificador único."""
        return await self._repo.get_by_id(window_id)

    async def update_maintenance_window(
        self, window_id: UUID, req: UpdateMaintenanceWindowRequest
    ) -> MaintenanceWindow | None:
        """Atualiza dados programados de uma janela de manutenção."""
        window = await self._repo.get_by_id(window_id)
        if window is None:
            return None

        if req.start_time is not None:
            window.start_time = _ensure_utc(req.start_time) or req.start_time
        if req.end_time is not None:
            window.end_time = _ensure_utc(req.end_time) or req.end_time
        if req.description is not None:
            window.description = req.description.strip()
        if req.device_id is not None:
            window.device_id = req.device_id
        if req.organization_id is not None:
            window.organization_id = req.organization_id
        if req.is_approved is not None:
            window.is_approved = req.is_approved

        saved = await self._repo.save(window)
        await self._commit()
        return saved

    async def approve_maintenance_window(self, window_id: UUID) -> MaintenanceWindow | None:
        """Aprova formalmente uma janela de manutenção programada."""
        window = await self._repo.get_by_id(window_id)
        if window is None:
            return None

        window.approve()
        saved = await self._repo.save(window)
        await self._commit()
        return saved

    async def delete_maintenance_window(self, window_id: UUID) -> bool:
        """Exclui uma janela de manutenção agendada."""
        deleted = await self._repo.delete(window_id)
        if deleted:
            await self._commit()
        return deleted

    async def list_maintenance_windows(
        self,
        organization_id: UUID | None = None,
        device_id: UUID | None = None,
        is_approved: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[MaintenanceWindow], int]:
        """Consulta janelas com paginação e filtros."""
        return await self._repo.list_windows(
            organization_id=organization_id,
            device_id=device_id,
            is_approved=is_approved,
            limit=limit,
            offset=offset,
        )
