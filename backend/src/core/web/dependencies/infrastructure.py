"""Dependências FastAPI para injeção de infraestrutura transversal (Redis, EventBus)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis

from src.core.infrastructure.redis import get_redis_client
from src.core.messaging import get_event_bus
from src.core.messaging.resilient_bus import ResilientEventBus

RedisDep = Annotated[Redis, Depends(get_redis_client)]
EventBusDep = Annotated[ResilientEventBus, Depends(get_event_bus)]

__all__ = [
    "EventBusDep",
    "RedisDep",
    "get_event_bus",
    "get_redis_client",
]
