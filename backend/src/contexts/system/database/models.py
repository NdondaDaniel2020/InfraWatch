"""Modelos ORM do SQLAlchemy 2.0 para persistência de configurações do sistema."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database.base_model import Base


class SystemSettingModel(Base):
    """Mapeamento relacional da tabela system_settings."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
    )
    updated_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        Index("idx_system_settings_category", "category"),
    )

    def __repr__(self) -> str:
        return f"<SystemSettingModel key={self.key!r} category={self.category!r} is_secret={self.is_secret}>"


__all__ = ["SystemSettingModel"]
