"""Redis client and utilities for caching, rate limiting, and sessions.

Provides a global Redis client with lazy initialization, fail-fast startup option,
and centralized helpers for cache, rate limiting, and session storage.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from contextlib import asynccontextmanager
from typing import Any, Optional

import redis.asyncio as redis
from redis.asyncio import Redis
from redis.exceptions import RedisError

from src.core.config import get_settings

logger = logging.getLogger(__name__)

_REDIS_URL_PASSWORD_PATTERN = re.compile(r"(?<=://)[^:@]*:[^@]+@")


def _sanitize_redis_url(url: str) -> str:
    """Remove password from Redis URL for safe logging."""
    return _REDIS_URL_PASSWORD_PATTERN.sub(":***@", url)


_redis_client: Optional[Redis] = None
_redis_init_lock = asyncio.Lock()
_redis_init_task: Optional[asyncio.Task] = None


def get_redis_client() -> Optional[Redis]:
    """Return the global Redis client, or None if not initialized."""
    return _redis_client


async def init_redis() -> Optional[Redis]:
    """Initialize Redis connection from settings.

    Called at startup (lifespan) for fail-fast behavior.
    Returns None if REDIS_URL is not configured.
    """
    global _redis_client
    settings = get_settings()

    redis_url = settings.REDIS_URL
    if not redis_url:
        logger.info("REDIS_URL not set; Redis features disabled")
        return None

    try:
        _redis_client = redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
        )
        await _redis_client.ping()
        logger.info("Redis connected: %s", _sanitize_redis_url(redis_url))
        return _redis_client
    except RedisError as e:
        logger.warning("Redis connection failed: %s", e)
        _redis_client = None
        if settings.ENVIRONMENT == "production":
            raise
        return None


async def ensure_redis() -> Optional[Redis]:
    """Lazily initialize Redis on first use (thread-safe).

    Use this in services that may run before lifespan (workers, CLI, tests).
    """
    global _redis_client, _redis_init_task
    if _redis_client is not None:
        return _redis_client

    async with _redis_init_lock:
        if _redis_client is not None:
            return _redis_client
        if _redis_init_task is None:
            _redis_init_task = asyncio.create_task(init_redis())
        return await _redis_init_task


async def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client, _redis_init_task
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None
    _redis_init_task = None


@asynccontextmanager
async def redis_lifespan():
    """Context manager for Redis lifecycle (alternative to manual init/close)."""
    await init_redis()
    try:
        yield
    finally:
        await close_redis()


# --- Cache helpers ---


async def cache_get(key: str) -> Any | None:
    """Get value from cache."""
    client = get_redis_client()
    if not client:
        return None
    try:
        data = await client.get(key)
        return json.loads(data) if data else None
    except RedisError as e:
        logger.warning("Cache get failed for %s: %s", key, e)
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> bool:
    """Set value in cache with TTL (seconds)."""
    client = get_redis_client()
    if not client:
        return False
    try:
        await client.setex(key, ttl, json.dumps(value))
        return True
    except RedisError as e:
        logger.warning("Cache set failed for %s: %s", key, e)
        return False


async def cache_delete(key: str) -> bool:
    """Delete key from cache."""
    client = get_redis_client()
    if not client:
        return False
    try:
        await client.delete(key)
        return True
    except RedisError as e:
        logger.warning("Cache delete failed for %s: %s", key, e)
        return False


async def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching pattern."""
    client = get_redis_client()
    if not client:
        return 0
    try:
        keys = []
        async for key in client.scan_iter(match=pattern):
            keys.append(key)
        if keys:
            return await client.delete(*keys)
        return 0
    except RedisError as e:
        logger.warning("Cache delete pattern failed for %s: %s", pattern, e)
        return 0


# --- Rate limiter helper (Redis-backed, atomic) ---


async def rate_limit_check(
    key: str, limit: int, window_seconds: int
) -> Optional[int]:
    """Check and consume a rate limit slot using atomic Redis operations.

    Returns retry_after seconds if limit exceeded, else None.

    In production environment, failures or Redis unavailability fail closed
    (returns retry_after=window_seconds) to prevent brute-force exploitation.
    In development/test, fails open (returns None) to allow progress without Redis.
    """
    settings = get_settings()
    client = get_redis_client()

    if not client:
        if settings.ENVIRONMENT == "production":
            logger.error(
                "Redis unavailable for rate limit check in production; enforcing fail-closed"
            )
            return window_seconds
        return None  # Fail open in dev/test

    try:
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, window_seconds)
        if current > limit:
            ttl = await client.ttl(key)
            return max(ttl, 1)
        return None
    except RedisError as e:
        logger.warning("Rate limit check failed for %s: %s", key, e)
        if settings.ENVIRONMENT == "production":
            return window_seconds
        return None  # Fail open in dev/test


# --- Session storage (for WebSocket / multi-device) ---

SESSION_PREFIX = "session:"
SESSION_TTL = 86400 * 30  # 30 days


async def session_store(
    session_id: str, data: dict[str, Any], ttl: int = SESSION_TTL
) -> bool:
    """Store session data."""
    return await cache_set(f"{SESSION_PREFIX}{session_id}", data, ttl)


async def session_get(session_id: str) -> Optional[dict[str, Any]]:
    """Retrieve session data."""
    return await cache_get(f"{SESSION_PREFIX}{session_id}")


async def session_delete(session_id: str) -> bool:
    """Delete session."""
    return await cache_delete(f"{SESSION_PREFIX}{session_id}")


async def session_delete_user_sessions(user_id: str) -> int:
    """Delete all sessions for a user."""
    return await cache_delete_pattern(f"{SESSION_PREFIX}*user_id:{user_id}*")