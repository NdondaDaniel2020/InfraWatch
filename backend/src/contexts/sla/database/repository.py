"""Repositório assíncrono para persistência de Janelas de Manutenção."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.sla.domain.models import MaintenanceWindow


class MaintenanceWindowRepository:
    """Repositório SQLAlchemy para gerenciamento da tabela `maintenance_windows`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, window_id: UUID) -> MaintenanceWindow | None:
        """Busca uma janela de manutenção por seu ID único."""
        stmt = select(MaintenanceWindowModel).where(MaintenanceWindowModel.id == window_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return model.to_domain() if model else None

    async def save(self, window: MaintenanceWindow) -> MaintenanceWindow:
        """Salva ou atualiza uma janela de manutenção garantindo idempotência."""
        stmt = select(MaintenanceWindowModel).where(MaintenanceWindowModel.id == window.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if model is None:
            model = MaintenanceWindowModel.from_domain(window)
            self._session.add(model)
        else:
            model.update_from_domain(window)

        await self._session.flush()
        return model.to_domain()

    async def delete(self, window_id: UUID) -> bool:
        """Remove uma janela de manutenção por ID."""
        stmt = delete(MaintenanceWindowModel).where(MaintenanceWindowModel.id == window_id)
        result = await self._session.execute(stmt)
        await self._session.flush()
        rowcount = getattr(result, "rowcount", 0)
        return bool(rowcount and int(rowcount) > 0)

    async def list_windows(
        self,
        organization_id: UUID | None = None,
        device_id: UUID | None = None,
        is_approved: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[MaintenanceWindow], int]:
        """Consulta janelas com paginação e filtros opcionais de escopo."""
        query = select(MaintenanceWindowModel)
        count_query = select(func.count(MaintenanceWindowModel.id))

        if organization_id is not None:
            query = query.where(MaintenanceWindowModel.organization_id == organization_id)
            count_query = count_query.where(MaintenanceWindowModel.organization_id == organization_id)

        if device_id is not None:
            query = query.where(MaintenanceWindowModel.device_id == device_id)
            count_query = count_query.where(MaintenanceWindowModel.device_id == device_id)

        if is_approved is not None:
            query = query.where(MaintenanceWindowModel.is_approved == is_approved)
            count_query = count_query.where(MaintenanceWindowModel.is_approved == is_approved)

        total_res = await self._session.execute(count_query)
        total = total_res.scalar_one()

        query = (
            query.order_by(MaintenanceWindowModel.start_time.desc())
            .limit(limit)
            .offset(offset)
        )
        items_res = await self._session.execute(query)
        models = items_res.scalars().all()

        return [m.to_domain() for m in models], total

    async def find_overlapping(
        self,
        start_time: datetime,
        end_time: datetime,
        device_id: UUID | None = None,
        approved_only: bool = True,
    ) -> list[MaintenanceWindow]:
        """Localiza janelas que coincidem temporalmente com o intervalo indicado."""
        conditions = [
            MaintenanceWindowModel.start_time < end_time,
            MaintenanceWindowModel.end_time > start_time,
        ]

        if approved_only:
            conditions.append(MaintenanceWindowModel.is_approved.is_(True))

        if device_id is not None:
            # Janelas atribuídas ao dispositivo específico ou janelas globais (device_id is null)
            conditions.append(
                or_(
                    MaintenanceWindowModel.device_id == device_id,
                    MaintenanceWindowModel.device_id.is_(None),
                )
            )

        stmt = (
            select(MaintenanceWindowModel)
            .where(and_(*conditions))
            .order_by(MaintenanceWindowModel.start_time.asc())
        )
        result = await self._session.execute(stmt)
        return [m.to_domain() for m in result.scalars().all()]
