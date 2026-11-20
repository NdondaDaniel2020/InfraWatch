from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.inventory.schemas.device_schemas import (
    DeviceDetail,
    DeviceListItem,
    DeviceSearchResult,
)
from src.contexts.inventory.schemas.filters import DeviceFilters
from src.core.web.pagination import PaginatedResponse, PaginationParams


class DeviceQueryService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_devices(
        self,
        org_id: UUID | None,
        filters: DeviceFilters,
        pagination: PaginationParams,
        is_viewer: bool = False,
    ) -> PaginatedResponse[DeviceListItem]:
        stmt = select(DeviceModel)
        if org_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == org_id)

        # 1. Busca textual por nome, IP ou hostname
        search_term = filters.search or filters.q
        if search_term and search_term.strip():
            term = f"%{search_term.strip()}%"
            stmt = stmt.where(
                (DeviceModel.name.ilike(term))
                | (DeviceModel.ip_address.ilike(term))
                | (DeviceModel.hostname.ilike(term))
            )

        # 2. Status de Saúde / Ciclo Operacional
        raw_status = (filters.status or filters.health_status or "").upper().strip()
        if raw_status:
            if raw_status == "PAUSED":
                stmt = stmt.where(
                    (DeviceModel.is_paused.is_(True)) | (func.upper(DeviceModel.status) == "PAUSED")
                )
            elif raw_status in ("MAINT", "MAINTENANCE"):
                stmt = stmt.where(
                    (DeviceModel.maintenance_until > func.now())
                    | (func.upper(DeviceModel.status).in_(["MAINT", "MAINTENANCE"]))
                )
            elif raw_status in ("DEG", "DEGRADED"):
                stmt = stmt.where(
                    (DeviceModel.is_paused.is_(False))
                    & (func.upper(DeviceModel.status).in_(["DEG", "DEGRADED"]))
                )
            elif raw_status == "UP":
                stmt = stmt.where(
                    (DeviceModel.is_paused.is_(False))
                    & (func.upper(DeviceModel.status) == "UP")
                )
            elif raw_status == "DOWN":
                stmt = stmt.where(
                    (DeviceModel.is_paused.is_(False))
                    & (func.upper(DeviceModel.status) == "DOWN")
                )
            else:
                stmt = stmt.where(func.upper(DeviceModel.status) == raw_status)

        # 3. Categoria de equipamento (Case-insensitive)
        if filters.category and filters.category.strip():
            stmt = stmt.where(func.upper(DeviceModel.category) == filters.category.strip().upper())

        # 4. Protocolo de sondagem (Case-insensitive)
        if filters.protocol and filters.protocol.strip():
            stmt = stmt.where(func.lower(DeviceModel.protocol) == filters.protocol.strip().lower())

        # 5. Pausado explicitamente
        if filters.is_paused is not None:
            stmt = stmt.where(DeviceModel.is_paused == filters.is_paused)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt) or 0

        stmt = stmt.order_by(DeviceModel.created_at.desc())
        stmt = stmt.limit(pagination.limit).offset(pagination.offset)

        result = await self.session.execute(stmt)
        devices = result.scalars().all()

        items = [DeviceListItem.model_validate(d) for d in devices]
        if is_viewer:
            items = [DeviceListItem.for_viewer(item) for item in items]

        return PaginatedResponse(
            items=items,
            total=total,
            page=pagination.page,
            page_size=pagination.page_size,
        )

    async def search_devices(
        self,
        org_id: UUID | None,
        query: str,
        pagination: PaginationParams,
        is_viewer: bool = False,
    ) -> PaginatedResponse[DeviceSearchResult]:
        stmt = select(DeviceModel)
        if org_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == org_id)

        if query:
            dialect_name = self.session.bind.dialect.name if self.session.bind else ""
            if dialect_name == "sqlite":
                stmt = stmt.where(
                    (DeviceModel.name.ilike(f"%{query}%"))
                    | (DeviceModel.ip_address.ilike(f"%{query}%"))
                    | (DeviceModel.hostname.ilike(f"%{query}%"))
                )
            else:
                ts_query = func.websearch_to_tsquery("portuguese", query)
                stmt = stmt.where(DeviceModel.search_vector.op("@@")(ts_query))
                stmt = stmt.order_by(func.ts_rank_cd(DeviceModel.search_vector, ts_query).desc())
        else:
            stmt = stmt.order_by(DeviceModel.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt) or 0

        stmt = stmt.limit(pagination.limit).offset(pagination.offset)

        result = await self.session.execute(stmt)
        devices = result.scalars().all()

        items = [DeviceSearchResult.model_validate(d) for d in devices]
        if is_viewer:
            items = [DeviceSearchResult.for_viewer(item) for item in items]

        return PaginatedResponse(
            items=items,
            total=total,
            page=pagination.page,
            page_size=pagination.page_size,
        )

    async def get_device_detail(
        self, org_id: UUID | None, device_id: UUID, is_viewer: bool = False
    ) -> DeviceDetail | None:
        stmt = select(DeviceModel).where(DeviceModel.id == device_id)
        if org_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == org_id)
        result = await self.session.execute(stmt)
        device = result.scalar_one_or_none()

        if not device:
            return None

        detail = DeviceDetail.model_validate(device)
        if is_viewer:
            return DeviceDetail.for_viewer(detail)
        return detail
