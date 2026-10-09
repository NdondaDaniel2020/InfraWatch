from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.inventory.domain.aggregate import Device


class DeviceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, device_id: UUID) -> DeviceModel | None:
        stmt = select(DeviceModel).where(DeviceModel.id == device_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_id(self, device_id: UUID) -> Device | None:
        """Busca o modelo por ID e reconstrói o agregado de domínio Device."""
        model = await self.get_by_id(device_id)
        if not model:
            return None
        device = Device(
            id=model.id,
            organization_id=model.organization_id,
            name=model.name,
            ip_address=model.ip_address,
            port=model.port,
            protocol=model.protocol,
            category=model.category,
            interval_seconds=model.interval_seconds,
            thresholds=model.thresholds,
            hostname=model.hostname,
            created_at=model.created_at,
        )
        device.status = model.status
        device.is_paused = model.is_paused
        device.maintenance_until = model.maintenance_until
        device.updated_at = model.updated_at
        return device

    async def save(self, device: Any) -> DeviceModel:
        """Persiste ou atualiza a entidade de domínio ou modelo de dispositivo na sessão ativa."""
        model = await self.get_by_id(device.id)
        if not model:
            model = DeviceModel(
                id=device.id,
                organization_id=device.organization_id,
            )
            self.session.add(model)
        
        model.name = device.name
        model.hostname = getattr(device, "hostname", None)
        model.ip_address = device.ip_address
        model.port = device.port
        model.protocol = device.protocol
        model.category = device.category
        model.interval_seconds = device.interval_seconds
        model.thresholds = device.thresholds
        model.is_paused = device.is_paused
        model.status = device.status
        model.maintenance_until = device.maintenance_until
        await self.session.flush()
        return model

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
