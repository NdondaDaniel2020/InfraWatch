"""Pacote de integrações de mensageria e notificações multicanal (ADR-022, ADR-023)."""

from __future__ import annotations

from functools import lru_cache

from src.integrations.notifications.channels.smtp import SmtpNotificationChannel
from src.integrations.notifications.channels.telegram import TelegramChannel
from src.integrations.notifications.channels.webhook import WebhookChannel
from src.integrations.notifications.channels.whatsapp import WhatsAppChannel
from src.integrations.notifications.dispatcher import (
    DEFAULT_SEVERITY_ROUTING,
    NotificationDispatcher,
)
from src.integrations.notifications.interfaces import (
    AlertMessage,
    AlertSeverity,
    NotificationChannel,
)


@lru_cache(maxsize=1)
def get_notification_dispatcher() -> NotificationDispatcher:
    """Instância singleton do gerenciador de notificações com os canais padrão."""
    channels: list[NotificationChannel] = [
        TelegramChannel(),
        WhatsAppChannel(),
        WebhookChannel(),
        SmtpNotificationChannel(),
    ]
    return NotificationDispatcher(channels=channels)


__all__ = [
    "DEFAULT_SEVERITY_ROUTING",
    "AlertMessage",
    "AlertSeverity",
    "NotificationChannel",
    "NotificationDispatcher",
    "SmtpNotificationChannel",
    "TelegramChannel",
    "WebhookChannel",
    "WhatsAppChannel",
    "get_notification_dispatcher",
]
