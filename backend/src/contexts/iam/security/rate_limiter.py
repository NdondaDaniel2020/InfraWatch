"""Mecanismo centralizado de Dual-Key Rate Limiting e Account Lockout temporário.

Protege endpoints de autenticação contra:
1. Força bruta concentrada (mesmo IP disparando contra uma ou várias contas).
2. Força bruta distribuída / botnets (múltiplos IPs rotativos atacando uma única conta alvo).

Utiliza Redis assíncrono com operações atômicas (INCR, EXPIRE, TTL, DEL)
e dispõe de fallback in-memory thread-safe e transparente.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from src.core.config import get_settings

logger = logging.getLogger(__name__)

IP_RATE_LIMIT_PREFIX = "rate_limit:login:ip:"
ACCOUNT_ATTEMPTS_PREFIX = "rate_limit:login:account:"
ACCOUNT_LOCKOUT_PREFIX = "lockout:account:"


class _InMemoryLimiterState:
    """Armazenamento em memória para fallback resiliente quando o Redis estiver inacessível."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ip_events: dict[str, deque[float]] = {}
        self._account_attempts: dict[str, deque[float]] = {}
        self._account_locked_until: dict[str, float] = {}

    def check_ip(self, ip: str, max_requests: int, window_seconds: float, now: float) -> int | None:
        with self._lock:
            events = self._ip_events.setdefault(ip, deque())
            while events and events[0] <= now - window_seconds:
                events.popleft()

            if len(events) >= max_requests:
                oldest = events[0]
                retry_after = max(1, int(oldest + window_seconds - now))
                return retry_after

            events.append(now)
            return None

    def check_lockout(self, email: str, now: float) -> int | None:
        with self._lock:
            locked_until = self._account_locked_until.get(email)
            if locked_until is not None:
                if now < locked_until:
                    return max(1, int(locked_until - now))
                self._account_locked_until.pop(email, None)
            return None

    def register_account_failure(
        self,
        email: str,
        max_failures: int,
        window_seconds: float,
        lockout_duration_seconds: float,
        now: float,
    ) -> tuple[int, int | None]:
        with self._lock:
            attempts = self._account_attempts.setdefault(email, deque())
            while attempts and attempts[0] <= now - window_seconds:
                attempts.popleft()

            attempts.append(now)
            count = len(attempts)

            if count >= max_failures:
                self._account_locked_until[email] = now + lockout_duration_seconds
                return count, int(lockout_duration_seconds)

            return count, None

    def reset_account(self, email: str) -> None:
        with self._lock:
            self._account_attempts.pop(email, None)
            self._account_locked_until.pop(email, None)

    def reset_ip(self, ip: str) -> None:
        with self._lock:
            self._ip_events.pop(ip, None)

    def clear(self) -> None:
        with self._lock:
            self._ip_events.clear()
            self._account_attempts.clear()
            self._account_locked_until.clear()


class DualKeyRateLimiter:
    """Implementa controle de taxa duplo por IP e por Conta com Account Lockout."""

    def __init__(
        self,
        redis_client: aioredis.Redis | None = None,
        ip_max_requests: int | None = None,
        ip_window_seconds: int | None = None,
        account_max_failures: int | None = None,
        account_window_seconds: int | None = None,
        account_lockout_duration_seconds: int | None = None,
    ) -> None:
        self._redis = redis_client
        settings = get_settings()

        self.ip_max_requests = (
            ip_max_requests if ip_max_requests is not None else settings.RATE_LIMIT_LOGIN_IP_MAX
        )
        self.ip_window_seconds = (
            ip_window_seconds
            if ip_window_seconds is not None
            else settings.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS
        )
        self.account_max_failures = (
            account_max_failures
            if account_max_failures is not None
            else settings.ACCOUNT_LOCKOUT_MAX_FAILURES
        )
        self.account_window_seconds = (
            account_window_seconds
            if account_window_seconds is not None
            else settings.ACCOUNT_LOCKOUT_WINDOW_SECONDS
        )
        self.account_lockout_duration_seconds = (
            account_lockout_duration_seconds
            if account_lockout_duration_seconds is not None
            else settings.ACCOUNT_LOCKOUT_DURATION_SECONDS
        )

        self._fallback = _InMemoryLimiterState()

    def normalize_email(self, email: str) -> str:
        """Normaliza o e-mail removendo espaços em branco e convertendo para minúsculas."""
        return email.strip().lower()

    async def check_ip_limit(self, client_ip: str) -> int | None:
        """Verifica se o IP ultrapassou o limite de requisições.

        Retorna Retry-After em segundos se excedido, ou None se permitido.
        """
        ip = client_ip.strip()
        if self._redis is not None:
            try:
                ip_key = f"{IP_RATE_LIMIT_PREFIX}{ip}"
                count = await self._redis.incr(ip_key)
                if count == 1:
                    await self._redis.expire(ip_key, self.ip_window_seconds)

                if count > self.ip_max_requests:
                    ttl = await self._redis.ttl(ip_key)
                    return max(1, ttl if ttl > 0 else self.ip_window_seconds)
                return None
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning(
                    "Falha ao validar rate limit de IP no Redis, usando fallback em memória: %s",
                    exc,
                )

        now = time.monotonic()
        return self._fallback.check_ip(ip, self.ip_max_requests, self.ip_window_seconds, now)

    def _account_key(self, email: str, client_ip: str | None = None) -> str:
        """Gera chave identificadora composta (email + IP) para mitigar enumeração e DoS."""
        norm_email = self.normalize_email(email)
        if client_ip:
            return f"{norm_email}:{client_ip.strip()}"
        return norm_email

    async def check_account_lockout(
        self, email: str, client_ip: str | None = None
    ) -> int | None:
        """Verifica se o par conta/IP está temporariamente bloqueado por Account Lockout.

        Retorna o tempo restante de bloqueio (em segundos) se bloqueada, ou None se liberada.
        """
        key = self._account_key(email, client_ip)
        if self._redis is not None:
            try:
                lockout_key = f"{ACCOUNT_LOCKOUT_PREFIX}{key}"
                ttl = await self._redis.ttl(lockout_key)
                if ttl > 0:
                    return ttl
                return None
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning(
                    "Falha ao consultar lockout de conta no Redis, usando fallback em memória: %s",
                    exc,
                )

        now = time.monotonic()
        return self._fallback.check_lockout(key, now)

    async def register_failed_account_attempt(
        self, email: str, client_ip: str | None = None
    ) -> tuple[int, int | None]:
        """Registra uma falha de login contra a conta alvo (por par email e IP).

        Retorna uma tupla (total_falhas, lockout_ttl_seconds).
        Se total_falhas atingir account_max_failures, ativa o Account Lockout imediatamente.
        """
        key = self._account_key(email, client_ip)
        if self._redis is not None:
            try:
                attempts_key = f"{ACCOUNT_ATTEMPTS_PREFIX}{key}"
                count = await self._redis.incr(attempts_key)
                if count == 1:
                    await self._redis.expire(attempts_key, self.account_window_seconds)

                if count >= self.account_max_failures:
                    lockout_key = f"{ACCOUNT_LOCKOUT_PREFIX}{key}"
                    await self._redis.set(
                        lockout_key, "1", ex=self.account_lockout_duration_seconds
                    )
                    return count, self.account_lockout_duration_seconds

                return count, None
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning(
                    "Falha ao registrar tentativa falha no Redis, usando fallback em memória: %s",
                    exc,
                )

        now = time.monotonic()
        return self._fallback.register_account_failure(
            key,
            self.account_max_failures,
            self.account_window_seconds,
            self.account_lockout_duration_seconds,
            now,
        )

    async def reset_account_attempts(
        self, email: str, client_ip: str | None = None
    ) -> None:
        """Limpa o contador de falhas e qualquer lockout ativo após autenticação com sucesso."""
        key = self._account_key(email, client_ip)
        if self._redis is not None:
            try:
                attempts_key = f"{ACCOUNT_ATTEMPTS_PREFIX}{key}"
                lockout_key = f"{ACCOUNT_LOCKOUT_PREFIX}{key}"
                await self._redis.delete(attempts_key, lockout_key)
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Falha ao resetar tentativas no Redis: %s", exc)

        self._fallback.reset_account(key)

    async def reset_ip_attempts(self, client_ip: str) -> None:
        """Reseta contador de requisições de um IP específico (útil para rotinas de teste)."""
        ip = client_ip.strip()
        if self._redis is not None:
            try:
                ip_key = f"{IP_RATE_LIMIT_PREFIX}{ip}"
                await self._redis.delete(ip_key)
            except (RedisError, ConnectionError, OSError):
                pass

        self._fallback.reset_ip(ip)

    def clear_in_memory_state(self) -> None:
        """Limpa todo o estado em memória (utilizado em testes unitários)."""
        self._fallback.clear()
