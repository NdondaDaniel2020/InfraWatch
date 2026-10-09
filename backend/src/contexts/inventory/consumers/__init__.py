"""Consumers assíncronos de eventos do Bounded Context Inventory."""

from src.contexts.inventory.consumers.inventory_changes_consumer import (
    CONSUMER_GROUP,
    STREAM_TOPIC,
    InventoryChangesConsumer,
)

__all__ = [
    "CONSUMER_GROUP",
    "STREAM_TOPIC",
    "InventoryChangesConsumer",
]
