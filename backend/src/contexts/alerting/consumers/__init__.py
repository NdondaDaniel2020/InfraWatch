"""Consumers do Bounded Context Alerting."""

from src.contexts.alerting.consumers.glpi_ticket_consumer import (
    CONSUMER_GROUP,
    CRITICAL_SEVERITIES,
    STREAM_TOPIC,
    GlpiTicketConsumer,
)

__all__ = [
    "CONSUMER_GROUP",
    "CRITICAL_SEVERITIES",
    "STREAM_TOPIC",
    "GlpiTicketConsumer",
]