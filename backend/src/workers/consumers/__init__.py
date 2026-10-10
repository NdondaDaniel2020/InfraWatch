"""Módulo de compatibilidade reversa para consumers legados."""

from src.contexts.alerting.consumers.alert_notification_consumer import (
    AlertNotificationConsumer,
)
from src.contexts.alerting.consumers.glpi_ticket_consumer import (
    GlpiTicketConsumer,
)
from src.contexts.inventory.consumers.inventory_changes_consumer import (
    InventoryChangesConsumer,
)

__all__ = [
    "AlertNotificationConsumer",
    "GlpiTicketConsumer",
    "InventoryChangesConsumer",
]