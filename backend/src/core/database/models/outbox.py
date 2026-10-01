"""Modelo relacional da tabela de Transactional Outbox (outbox_events).

Armazena eventos de domínio gerados em mutações de negócio na mesma transação ACID
do banco de dados relacional, permitindo despacho assíncrono garantido (At-Least-Once Delivery).
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from src.core.database.base_model import Base
from src.core.domain.entity import generate_uuid7


class OutboxStatus(StrEnum):
    """Estados do ciclo de vida de um evento no Outbox."""

    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


# Suporte híbrido a JSONB no PostgreSQL e JSON no SQLite
JSONType = JSON().with_variant(JSONB, "postgresql")


class OutboxEventModel(Base):
    """Mapeamento ORM da tabela outbox_events."""

    __tablename__ = "outbox_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    aggregate_id: Mapped[UUID | None] = mapped_column(nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=OutboxStatus.PENDING,
    )
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        Index("idx_outbox_pending_created", "status", "created_at"),
        Index("idx_outbox_aggregate", "aggregate_type", "aggregate_id"),
    )
