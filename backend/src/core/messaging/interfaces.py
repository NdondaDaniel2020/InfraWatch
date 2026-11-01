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
        """Processa o evento recebido no tópico especificado com assinatura padrão (topic, event_data)."""
        ...


# Assinatura canônica padronizada equivalente a EventHandler.handle(topic, event_data)
EventHandlerCallable = Callable[[str, dict[str, Any]], Awaitable[None]]

# Assinatura legada de argumento único mantida para retrocompatibilidade (ADR-001)
LegacyEventHandlerCallable = Callable[[dict[str, Any]], Awaitable[None]]

# Tipo unificado e estrito para manipuladores de eventos assíncronos
HandlerType = EventHandler | EventHandlerCallable


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
    async def get_delivery_count(self, topic: str, group: str, message_id: str) -> int:
        """Retorna o número de tentativas/entregas realizadas para a mensagem pendente."""
        ...

    @abstractmethod
    async def should_process_retry(self, topic: str, group: str, message_id: str) -> bool:
        """Avalia se uma mensagem pendente/reentregue atingiu o tempo mínimo de espera (backoff progressivo).

        Retorna True se for a 1ª tentativa ou se o tempo decorrido desde a última entrega exceder o limiar
        de recuo (30s, 60s, 180s, 300s). Retorna False se a mensagem deve ser ignorada neste ciclo de leitura.
        """
        ...

    @abstractmethod
    async def send_to_dlq(
        self,
        topic: str,
        group: str,
        message_id: str,
        payload: dict[str, Any],
        error: str,
        delivery_count: int,
    ) -> str:
        """Encaminha mensagem com erro permanente para o stream de Dead Letter ({topic}:dlq) e confirma no stream de origem."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Encerra graciosamente recursos, conexões ou workers associados ao barramento."""
        ...
