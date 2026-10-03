from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.inventory.database.models import DeviceModel


class DeviceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def search_devices(
        self,
        query: str,
        organization_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[DeviceModel]:
        """Realiza busca full-text usando o índice GIN no PostgreSQL."""
        stmt = select(DeviceModel).where(
            DeviceModel.organization_id == organization_id
        )

        if query:
            dialect_name = self.session.bind.dialect.name if self.session.bind else ""
            if dialect_name == "sqlite":
                # Fallback for sqlite tests
                stmt = stmt.where(
                    (DeviceModel.name.ilike(f"%{query}%")) |
                    (DeviceModel.ip_address.ilike(f"%{query}%")) |
                    (DeviceModel.hostname.ilike(f"%{query}%"))
                )
            else:
                # websearch_to_tsquery allows operators like "term1 -term2"
                ts_query = func.websearch_to_tsquery('portuguese', query)
                stmt = stmt.where(
                    DeviceModel.search_vector.op("@@")(ts_query)
                ).order_by(
                    func.ts_rank_cd(DeviceModel.search_vector, ts_query).desc()
                )
        else:
            stmt = stmt.order_by(DeviceModel.created_at.desc())

        stmt = stmt.limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return result.scalars().all()
