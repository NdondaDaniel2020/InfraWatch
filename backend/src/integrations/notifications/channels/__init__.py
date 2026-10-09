"""Módulo de canais de notificação multicanal."""

from __future__ import annotations

from src.integrations.notifications.channels.smtp import SmtpNotificationChannel
from src.integrations.notifications.channels.telegram import TelegramChannel
from src.integrations.notifications.channels.webhook import WebhookChannel
from src.integrations.notifications.channels.whatsapp import WhatsAppChannel

__all__ = [
    "SmtpNotificationChannel",
    "TelegramChannel",
    "WebhookChannel",
    "WhatsAppChannel",
]
