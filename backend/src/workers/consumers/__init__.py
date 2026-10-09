"""Módulo de compatibilidade reversa para consumers legados."""

from src.contexts.integrations.consumers.glpi_ticket_consumer import (
    GlpiTicketConsumer,
)
from src.contexts.inventory.consumers.inventory_changes_consumer import (
    InventoryChangesConsumer,
)

__all__ = [
    "GlpiTicketConsumer",
    "InventoryChangesConsumer",
]
