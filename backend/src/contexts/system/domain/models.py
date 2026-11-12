"""Entidades e modelos de domínio para configurações do sistema (Bounded Context: System)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID


@dataclass(frozen=True)
class SystemSetting:
    """Representação pura de domínio para um parâmetro persistido de configuração."""

    key: str
    category: str
    value: str
    is_secret: bool = False
    updated_at: datetime = datetime.now(UTC)
    updated_by: UUID | None = None

    def __post_init__(self) -> None:
        if not self.key or not self.key.strip():
            raise ValueError("A chave de configuração não pode ser vazia.")
        if not self.category or not self.category.strip():
            raise ValueError("A categoria de configuração não pode ser vazia.")


__all__ = ["SystemSetting"]
