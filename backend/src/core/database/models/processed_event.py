"""Modelo relacional da tabela de eventos processados (processed_events).

Armazena o registro persistente de idempotência para consumidores de mensageria,
evitando duplicação de efeitos colaterais externos em cenários de reentrega (XAUTOCLAIM).
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database.base_model import Base


class ProcessedEventModel(Base):
    """Mapeamento ORM da tabela processed_events."""

    __tablename__ = "processed_events"

    event_id: Mapped[UUID] = mapped_column(primary_key=True)
    consumer_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        Index("idx_processed_events_processed_at", "processed_at"),
    )
