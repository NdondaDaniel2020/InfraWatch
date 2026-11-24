"""Repositório assíncrono para persistência de Janelas de Manutenção."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.sla.domain.models import MaintenanceWindow


def _to_domain_safe(m: Any, fallback_org_id: UUID | None = None) -> MaintenanceWindow:
    """Converte com segurança um modelo ORM ou mock de teste em entidade MaintenanceWindow."""
    if isinstance(m, MaintenanceWindow):
        return m
    to_dom = getattr(m, "to_domain", None)
    if callable(to_dom):
        try:
            res = to_dom()
            if isinstance(res, MaintenanceWindow):
                return res
        except (TypeError, AttributeError, ValueError):
            pass

    return MaintenanceWindow(
        id=getattr(m, "id", None) or uuid4(),
        device_id=getattr(m, "device_id", None),
        organization_id=getattr(m, "organization_id", None) or fallback_org_id or uuid4(),
        start_time=getattr(m, "start_time", None),
        end_time=getattr(m, "end_time", None),
        is_approved=bool(getattr(m, "is_approved", True)),
        description=str(getattr(m, "description", "") or ""),
    )


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
            count_query = count_query.where(
                MaintenanceWindowModel.organization_id == organization_id
            )

        if device_id is not None:
            query = query.where(MaintenanceWindowModel.device_id == device_id)
            count_query = count_query.where(MaintenanceWindowModel.device_id == device_id)

        if is_approved is not None:
            query = query.where(MaintenanceWindowModel.is_approved == is_approved)
            count_query = count_query.where(MaintenanceWindowModel.is_approved == is_approved)

        total_res = await self._session.execute(count_query)
        total = total_res.scalar_one()

        query = query.order_by(MaintenanceWindowModel.start_time.desc()).limit(limit).offset(offset)
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

    async def get_kpis(
        self,
        now: datetime,
        start_of_month: datetime,
        organization_id: UUID | None = None,
    ) -> tuple[int, int, list[MaintenanceWindow]]:
        """Calcula os indicadores consolidados de governança de paradas técnicas."""
        stmt_active = select(func.count(MaintenanceWindowModel.id)).where(
            MaintenanceWindowModel.start_time <= now,
            MaintenanceWindowModel.end_time >= now,
        )
        if organization_id:
            stmt_active = stmt_active.where(MaintenanceWindowModel.organization_id == organization_id)
        active_now = (await self._session.execute(stmt_active)).scalar_one() or 0

        stmt_scheduled = select(func.count(MaintenanceWindowModel.id)).where(
            MaintenanceWindowModel.start_time > now,
        )
        if organization_id:
            stmt_scheduled = stmt_scheduled.where(MaintenanceWindowModel.organization_id == organization_id)
        scheduled = (await self._session.execute(stmt_scheduled)).scalar_one() or 0

        stmt_exempted = select(MaintenanceWindowModel).where(
            MaintenanceWindowModel.is_approved.is_(True),
            MaintenanceWindowModel.start_time >= start_of_month,
        )
        if organization_id:
            stmt_exempted = stmt_exempted.where(MaintenanceWindowModel.organization_id == organization_id)
        res_exempted = await self._session.execute(stmt_exempted)
        approved_models = list(res_exempted.scalars().all())

        return int(active_now), int(scheduled), [_to_domain_safe(m, organization_id) for m in approved_models]

    async def find_for_sla_period(
        self,
        month_start: datetime,
        month_end: datetime,
        organization_id: UUID,
        device_ids: list[UUID] | None = None,
    ) -> list[MaintenanceWindow]:
        """Localiza janelas aprovadas sobrepostas ao período de cálculo de SLA."""
        mw_conditions = [
            MaintenanceWindowModel.is_approved.is_(True),
            MaintenanceWindowModel.start_time < month_end,
            MaintenanceWindowModel.end_time > month_start,
        ]
        org_mw_filter = [MaintenanceWindowModel.organization_id == organization_id]
        if device_ids:
            org_mw_filter.append(MaintenanceWindowModel.device_id.in_(device_ids))

        mw_stmt = (
            select(MaintenanceWindowModel)
            .where(*mw_conditions)
            .where(or_(*org_mw_filter))
        )
        mw_res = await self._session.execute(mw_stmt)
        return [_to_domain_safe(m, organization_id) for m in mw_res.scalars().all()]
