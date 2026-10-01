"""Mecanismo de Lock Distribuído Não-Bloqueante com Redis (ADR-024).

Garante exclusão mútua entre múltiplas instâncias e réplicas de workers concorrentes
através do padrão Redlock atômico (SET NX EX) com liberação segura via script Lua.
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Self
from uuid import uuid4

import redis.asyncio as aioredis
from redis.exceptions import RedisError

logger = logging.getLogger("infrawatch.redis.distributed_lock")

# Script Lua para liberação segura: apenas o proprietário original (owner_id) pode remover o lock
LUA_RELEASE_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


class DistributedLock:
    """Implementação assíncrona de Lock Distribuído no Redis."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        key: str,
        timeout: int = 300,
        blocking: bool = False,
        sleep_interval: float = 0.1,
    ) -> None:
        """Inicializa o lock distribuído.

        Args:
            redis_client: Instância do cliente Redis assíncrono.
            key: Identificador único do recurso a ser travado (ex: 'token_cleanup').
            timeout: Tempo de vida (TTL) do lock em segundos antes da expiração automática.
            blocking: Se True, aguarda até o lock ficar disponível; se False, desiste imediatamente.
            sleep_interval: Intervalo em segundos entre tentativas quando blocking=True.
        """
        self.redis = redis_client
        self.key = key
        self.lock_key = key if key.startswith("lock:") else f"lock:{key}"
        self.timeout = timeout
        self.blocking = blocking
        self.sleep_interval = sleep_interval
        self.owner_id = str(uuid4())
        self._acquired = False

    @property
    def acquired(self) -> bool:
        """Retorna se o lock foi adquirido com sucesso pela instância atual."""
        return self._acquired

    def __bool__(self) -> bool:
        """Permite checagem booleana direta: `if lock:`."""
        return self._acquired

    async def acquire(self, blocking: bool | None = None) -> bool:
        """Tenta adquirir o lock no Redis utilizando SET NX EX atômico."""
        should_block = self.blocking if blocking is None else blocking

        while True:
            try:
                # SET com NX (só define se não existir) e EX (TTL em segundos)
                result = await self.redis.set(
                    self.lock_key,
                    self.owner_id,
                    nx=True,
                    ex=self.timeout,
                )
                if result:
                    self._acquired = True
                    logger.debug(
                        "Lock adquirido com sucesso para '%s' (owner: %s, ttl: %ds)",
                        self.lock_key,
                        self.owner_id,
                        self.timeout,
                    )
                    return True

                if not should_block:
                    self._acquired = False
                    logger.debug(
                        "Lock '%s' já retido por outra instância; desistindo (não-bloqueante)",
                        self.lock_key,
                    )
                    return False

                await asyncio.sleep(self.sleep_interval)

            except (RedisError, ConnectionRefusedError, OSError) as exc:
                logger.warning(
                    "Falha de comunicação com Redis ao tentar adquirir lock '%s': %s",
                    self.lock_key,
                    exc,
                )
                self._acquired = False
                return False

    async def release(self) -> bool:
        """Libera o lock no Redis garantindo que pertence ao proprietário atual via Lua."""
        if not self._acquired:
            return False

        try:
            # Executa script Lua atômico comparando o owner_id armazenado
            deleted = await self.redis.eval(
                LUA_RELEASE_SCRIPT,
                1,
                self.lock_key,
                self.owner_id,
            )
            released = bool(deleted)
            if released:
                logger.debug(
                    "Lock '%s' liberado com sucesso pelo owner %s",
                    self.lock_key,
                    self.owner_id,
                )
            else:
                logger.warning(
                    "Lock '%s' expirou ou foi sobrescrito antes da liberação pelo owner %s",
                    self.lock_key,
                    self.owner_id,
                )
            self._acquired = False
            return released

        except (RedisError, ConnectionRefusedError, OSError) as exc:
            logger.warning(
                "Falha de comunicação com Redis ao tentar liberar lock '%s': %s",
                self.lock_key,
                exc,
            )
            self._acquired = False
            return False

    async def __aenter__(self) -> Self:
        await self.acquire()
        return self

    async def __aexit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        await self.release()


@asynccontextmanager
async def redis_distributed_lock(
    redis_client: aioredis.Redis,
    key: str,
    timeout: int = 300,
    blocking: bool = False,
    sleep_interval: float = 0.1,
) -> AsyncGenerator[DistributedLock, None]:
    """Context manager assíncrono ergonômico para lock distribuído com Redis.

    Exemplo de uso:
        async with redis_distributed_lock(redis, "token_cleanup", timeout=60, blocking=False) as lock:
            if not lock.acquired:
                return  # Outra instância já está executando
            await executar_tarefa()
    """
    lock = DistributedLock(
        redis_client=redis_client,
        key=key,
        timeout=timeout,
        blocking=blocking,
        sleep_interval=sleep_interval,
    )
    async with lock:
        yield lock
