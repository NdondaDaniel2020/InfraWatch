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

    async def get_by_id(
        self, device_id: UUID, organization_id: UUID | None = None
    ) -> DeviceModel | None:
        stmt = select(DeviceModel).where(DeviceModel.id == device_id)
        if organization_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == organization_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    def _to_domain(self, model: Any) -> Device:
        """Reconstrói o agregado de domínio Device a partir do modelo ORM."""
        if isinstance(model, Device):
            return model

        ip_val = getattr(model, "ip_address", "127.0.0.1")
        if not isinstance(ip_val, str):
            ip_val = "127.0.0.1"

        port_val = getattr(model, "port", 80)
        if not isinstance(port_val, int):
            port_val = 80

        protocol_val = getattr(model, "protocol", "icmp")
        if not isinstance(protocol_val, str):
            protocol_val = "icmp"

        cat_val = getattr(model, "category", "ROUTER")
        if not isinstance(cat_val, str):
            cat_val = "ROUTER"

        interval_val = getattr(model, "interval_seconds", 60)
        if not isinstance(interval_val, int):
            interval_val = 60

        thresholds_val = getattr(model, "thresholds", {})
        if not isinstance(thresholds_val, dict):
            thresholds_val = {}

        device = Device(
            id=model.id,
            organization_id=model.organization_id,
            name=getattr(model, "name", "Dispositivo"),
            ip_address=ip_val,
            port=port_val,
            protocol=protocol_val,
            category=cat_val,
            interval_seconds=interval_val,
            thresholds=thresholds_val,
            hostname=getattr(model, "hostname", None),
            created_at=getattr(model, "created_at", None),
        )
        status_val = getattr(model, "status", None)
        if isinstance(status_val, str):
            device.status = status_val
        is_paused_val = getattr(model, "is_paused", None)
        if isinstance(is_paused_val, bool):
            device.is_paused = is_paused_val
        device.maintenance_until = getattr(model, "maintenance_until", None)
        device.updated_at = getattr(model, "updated_at", None)
        return device

    async def find_by_id(self, device_id: UUID) -> Device | None:
        """Busca o modelo por ID e reconstrói o agregado de domínio Device."""
        model = await self.get_by_id(device_id)
        return self._to_domain(model) if model else None

    async def find_by_ids(
        self, device_ids: list[UUID], organization_id: UUID | None = None
    ) -> list[Device]:
        """Busca múltiplos dispositivos por IDs e escopo opcional de organização."""
        if not device_ids:
            return []
        stmt = select(DeviceModel).where(DeviceModel.id.in_(device_ids))
        if organization_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == organization_id)
        result = await self.session.execute(stmt)
        scalars_fn = getattr(result, "scalars", None)
        models = scalars_fn().all() if callable(scalars_fn) else (result.all() if hasattr(result, "all") else [])
        return [self._to_domain(m) for m in models]

    async def get_names_by_ids(self, device_ids: list[UUID]) -> dict[UUID, str]:
        """Recupera mapeamento de id para nome para uma lista de dispositivos."""
        if not device_ids:
            return {}
        stmt = select(DeviceModel.id, DeviceModel.name).where(DeviceModel.id.in_(device_ids))
        result = await self.session.execute(stmt)
        rows_fn = getattr(result, "all", None)
        if callable(rows_fn):
            res_all = rows_fn()
            if isinstance(res_all, list) and res_all:
                if isinstance(res_all[0], (tuple, list)):
                    return {r[0]: r[1] for r in res_all}
                if hasattr(res_all[0], "id") and hasattr(res_all[0], "name"):
                    return {r.id: r.name for r in res_all}
        return {}

    async def find_by_organization(self, organization_id: UUID) -> list[Device]:
        """Busca todos os dispositivos pertencentes a uma organização ordenados por nome."""
        stmt = (
            select(DeviceModel)
            .where(DeviceModel.organization_id == organization_id)
            .order_by(DeviceModel.name.asc())
        )
        result = await self.session.execute(stmt)
        scalars_fn = getattr(result, "scalars", None)
        items = scalars_fn().all() if callable(scalars_fn) else (result.all() if hasattr(result, "all") else [])
        return [self._to_domain(m) for m in items]

    async def list_devices(
        self,
        organization_id: UUID | None = None,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Device], int]:
        """Consulta paginada de dispositivos para integração e consultas analíticas."""
        stmt = select(DeviceModel)
        if organization_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == organization_id)
        if status_filter:
            stmt = stmt.where(DeviceModel.status == status_filter.upper())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one() or 0

        stmt = stmt.order_by(DeviceModel.name.asc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self._to_domain(m) for m in models], total

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

    async def list_with_filters(
        self,
        organization_id: UUID | None,
        filters: Any = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[DeviceModel], int]:
        """Consulta paginada de modelos de dispositivos aplicando filtros de inventário."""
        stmt = select(DeviceModel)
        if organization_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == organization_id)

        search_term = getattr(filters, "search", None) or getattr(filters, "q", None)
        if search_term and search_term.strip():
            term = f"%{search_term.strip()}%"
            stmt = stmt.where(
                (DeviceModel.name.ilike(term))
                | (DeviceModel.ip_address.ilike(term))
                | (DeviceModel.hostname.ilike(term))
            )

        raw_status = (
            getattr(filters, "status", None) or getattr(filters, "health_status", None) or ""
        ).upper().strip()
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

        category = getattr(filters, "category", None)
        if category and category.strip():
            stmt = stmt.where(func.upper(DeviceModel.category) == category.strip().upper())

        protocol = getattr(filters, "protocol", None)
        if protocol and protocol.strip():
            stmt = stmt.where(func.lower(DeviceModel.protocol) == protocol.strip().lower())

        is_paused = getattr(filters, "is_paused", None)
        if is_paused is not None:
            stmt = stmt.where(DeviceModel.is_paused == is_paused)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one() or 0

        stmt = stmt.order_by(DeviceModel.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def search_devices_paginated(
        self,
        organization_id: UUID | None,
        query: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[DeviceModel], int]:
        """Busca full-text ou textual paginada de dispositivos com contagem total."""
        stmt = select(DeviceModel)
        if organization_id is not None:
            stmt = stmt.where(DeviceModel.organization_id == organization_id)

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
                stmt = stmt.where(DeviceModel.search_vector.op("@@")(ts_query)).order_by(
                    func.ts_rank_cd(DeviceModel.search_vector, ts_query).desc()
                )
        else:
            stmt = stmt.order_by(DeviceModel.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one() or 0

        stmt = stmt.limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def search_devices(
        self,
        query: str,
        organization_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[DeviceModel]:
        """Realiza busca full-text usando o índice GIN no PostgreSQL."""
        stmt = select(DeviceModel).where(DeviceModel.organization_id == organization_id)

        if query:
            dialect_name = self.session.bind.dialect.name if self.session.bind else ""
            if dialect_name == "sqlite":
                # Fallback for sqlite tests
                stmt = stmt.where(
                    (DeviceModel.name.ilike(f"%{query}%"))
                    | (DeviceModel.ip_address.ilike(f"%{query}%"))
                    | (DeviceModel.hostname.ilike(f"%{query}%"))
                )
            else:
                # websearch_to_tsquery allows operators like "term1 -term2"
                ts_query = func.websearch_to_tsquery("portuguese", query)
                stmt = stmt.where(DeviceModel.search_vector.op("@@")(ts_query)).order_by(
                    func.ts_rank_cd(DeviceModel.search_vector, ts_query).desc()
                )
        else:
            stmt = stmt.order_by(DeviceModel.created_at.desc())

        stmt = stmt.limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return result.scalars().all()
