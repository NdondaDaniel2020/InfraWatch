"""Primitiva base de Raiz de Agregação (Aggregate Root - DDD) para o InfraWatch.

Agregados definem fronteiras de consistência transacional e encapsulam o ciclo de vida
das entidades filhas, registrando eventos de domínio que são disparados após persistência atômica.
"""
from datetime import datetime
from typing import Sequence
from uuid import UUID

from src.core.domain.entity import Entity
from src.core.domain.events import DomainEvent


class AggregateRoot(Entity):
    """Classe base abstrata para todas as Raízes de Agregação do sistema.

    Regras de Negócio:
    - Herda de `Entity` possuindo identidade única e contínua via UUIDv7.
    - Encapsula a fronteira de consistência para todas as entidades e objetos de valor internos.
    - Mantém uma coleção interna privada de eventos de domínio que ocorreram durante mutações de negócio.
    - Expõe os eventos de forma imutável (tupla) e oferece método para limpeza pós-despacho no Outbox.
    """

    def __init__(self, id: UUID | None = None, created_at: datetime | None = None) -> None:
        super().__init__(id=id, created_at=created_at)
        self._domain_events: list[DomainEvent] = []

    @property
    def domain_events(self) -> tuple[DomainEvent, ...]:
        """Retorna uma visão imutável dos eventos de domínio acumulados."""
        return tuple(self._domain_events)

    def add_domain_event(self, event: DomainEvent) -> None:
        """Registra um novo evento de domínio ocorrido no agregado.

        Se o evento não possuir `aggregate_id` definido, associa automaticamente ao ID desta raiz.
        """
        if event.aggregate_id is None:
            # Como DomainEvent é frozen, definimos via object.__setattr__ para associar a raiz
            object.__setattr__(event, "aggregate_id", self.id)
        self._domain_events.append(event)

    def clear_domain_events(self) -> None:
        """Limpa a lista de eventos de domínio acumulados após o registro transacional no Outbox."""
        self._domain_events.clear()

    def pull_domain_events(self) -> list[DomainEvent]:
        """Utilitário atômico que extrai todos os eventos acumulados e limpa a lista interna."""
        events = list(self._domain_events)
        self.clear_domain_events()
        return events
