"""Módulo de compatibilidade reversa para GlpiTicketConsumer (ADR-001).

Redireciona para src.contexts.alerting.consumers.glpi_ticket_consumer.
"""

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