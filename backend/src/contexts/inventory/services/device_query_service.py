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
        org_id: UUID,
        filters: DeviceFilters,
        pagination: PaginationParams,
        is_viewer: bool = False,
    ) -> PaginatedResponse[DeviceListItem]:
        stmt = select(DeviceModel).where(DeviceModel.organization_id == org_id)

        if filters.status:
            stmt = stmt.where(DeviceModel.status == filters.status)
        if filters.category:
            stmt = stmt.where(DeviceModel.category == filters.category)
        if filters.protocol:
            stmt = stmt.where(DeviceModel.protocol == filters.protocol)
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
        org_id: UUID,
        query: str,
        pagination: PaginationParams,
        is_viewer: bool = False,
    ) -> PaginatedResponse[DeviceSearchResult]:
        stmt = select(DeviceModel).where(DeviceModel.organization_id == org_id)

        if query:
            dialect_name = self.session.bind.dialect.name if self.session.bind else ""
            if dialect_name == "sqlite":
                stmt = stmt.where(
                    (DeviceModel.name.ilike(f"%{query}%")) |
                    (DeviceModel.ip_address.ilike(f"%{query}%")) |
                    (DeviceModel.hostname.ilike(f"%{query}%"))
                )
            else:
                ts_query = func.websearch_to_tsquery('portuguese', query)
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
        self, org_id: UUID, device_id: UUID, is_viewer: bool = False
    ) -> DeviceDetail | None:
        stmt = select(DeviceModel).where(
            DeviceModel.id == device_id,
            DeviceModel.organization_id == org_id
        )
        result = await self.session.execute(stmt)
        device = result.scalar_one_or_none()

        if not device:
            return None

        detail = DeviceDetail.model_validate(device)
        if is_viewer:
            return DeviceDetail.for_viewer(detail)
        return detail
