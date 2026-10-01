"""Primitiva base de Eventos de Domínio (Domain Events - DDD) para o InfraWatch.

Eventos de domínio representam fatos consumados de negócio relevantes para o sistema,
sendo imutáveis, cronologicamente ordenados (UUIDv7) e serializáveis para o Transactional Outbox.
"""
from abc import ABC
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from src.core.domain.entity import generate_uuid7


@dataclass(frozen=True)
class DomainEvent(ABC):
    """Classe base abstrata para todos os Eventos de Domínio.

    Regras de Negócio:
    - Imutabilidade: Um evento representa algo que já aconteceu e nunca pode ser modificado.
    - Metadados padronizados: `event_id: UUID` (UUIDv7), `occurred_at: datetime` (UTC) e `event_type: str`.
    - Serializável: Fornece representação em dicionário primitivo para persistência na tabela `outbox_events`
      e publicação via Redis Streams.
    """

    event_id: UUID = field(default_factory=generate_uuid7)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    aggregate_id: UUID | None = field(default=None)

    @property
    def event_type(self) -> str:
        """Tipo/nome qualificado do evento de domínio (ex: DeviceCreated, IncidentTriggered)."""
        return self.__class__.__name__

    def to_dict(self) -> dict[str, Any]:
        """Serializa o evento para um dicionário compatível com JSON / Outbox payload.

        Converte UUIDs para strings e datetimes para formato ISO-8601 UTC.
        """
        raw_dict = asdict(self)
        result: dict[str, Any] = {}
        for key, value in raw_dict.items():
            if isinstance(value, UUID):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value
        result["event_type"] = self.event_type
        return result
