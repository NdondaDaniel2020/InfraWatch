"""Protocolos e contratos abstratos para o Barramento de Eventos (EventBus).

Define as interfaces padrão para desacoplamento entre produtores e consumidores de mensagens,
garantindo suporte a eventos de domínio (DDD) e estruturas de dicionário serializáveis.
"""

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import Any, Protocol, runtime_checkable

from src.core.domain.events import DomainEvent


@runtime_checkable
class EventHandler(Protocol):
    """Protocolo abstrato para manipuladores assíncronos de eventos."""

    async def handle(self, topic: str, event_data: dict[str, Any]) -> None:
        """Processa o evento recebido no tópico especificado."""
        ...


HandlerType = EventHandler | Callable[[dict[str, Any]], Awaitable[None]] | Callable[[str, dict[str, Any]], Awaitable[None]]


class EventBus(ABC):
    """Contrato abstrato para implementações de barramento de eventos assíncrono."""

    @abstractmethod
    async def publish(self, topic: str, event: DomainEvent | dict[str, Any]) -> bool:
        """Publica um evento em um tópico/stream específico.

        Aceita instâncias de DomainEvent ou dicionários serializáveis.
        Retorna True se publicado com sucesso, ou False em caso de falha.
        """
        ...

    @abstractmethod
    async def subscribe(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        handler: HandlerType,
        batch_size: int = 20,
    ) -> None:
        """Registra um consumidor assíncrono para o tópico e grupo especificados."""
        ...

    @abstractmethod
    async def consume_batch(
        self,
        topic: str,
        group: str,
        consumer_name: str,
        batch_size: int = 20,
        timeout_ms: int = 2000,
    ) -> list[tuple[str, dict[str, Any]]]:
        """Lê um lote de mensagens no grupo (retorna lista de tuplas (message_id, event_dict))."""
        ...

    @abstractmethod
    async def ack(self, topic: str, group: str, *message_ids: str) -> int:
        """Confirma manualmente (ACK) uma ou mais mensagens processadas com sucesso."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Encerra graciosamente recursos, conexões ou workers associados ao barramento."""
        ...
