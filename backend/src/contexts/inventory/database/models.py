from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Computed, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database.base_model import Base


class DeviceModel(Base):
    __tablename__ = "devices"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(index=True)
    
    name: Mapped[str] = mapped_column(String(255))
    hostname: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str] = mapped_column(String(45))
    port: Mapped[int]
    protocol: Mapped[str] = mapped_column(String(50))
    category: Mapped[str] = mapped_column(String(50))
    
    interval_seconds: Mapped[int] = mapped_column(default=60)
    thresholds: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    
    is_paused: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(50), default="UP")
    maintenance_until: Mapped[datetime | None]
    
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    search_vector: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(ip_address, '') || ' ' || coalesce(hostname, ''))",
            persisted=True
        )
    )

    __table_args__ = (
        Index("ix_devices_search_vector", "search_vector", postgresql_using="gin"),
    )
