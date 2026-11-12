"""Eventos de domínio disparados pelo contexto System para sincronização de configurações."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from src.core.domain.events import DomainEvent


@dataclass(frozen=True)
class SystemSettingUpdatedEvent(DomainEvent):
    """Fato de negócio: um parâmetro de configuração do sistema foi alterado pelo administrador."""

    category: str = ""
    key: str = ""
    is_secret: bool = False
    updated_by: UUID | None = None


@dataclass(frozen=True)
class SystemSettingResetEvent(DomainEvent):
    """Fato de negócio: configurações de uma categoria foram restauradas para o padrão do ambiente."""

    category: str = ""
    updated_by: UUID | None = None


__all__ = ["SystemSettingResetEvent", "SystemSettingUpdatedEvent"]
