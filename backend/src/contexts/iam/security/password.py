"""Serviço de hashing criptográfico de senhas utilizando Argon2id (RFC 9106).

Garante armazenamento seguro contra ataques de dicionário, rainbow tables e força bruta
em GPUs/ASICs através de custo calibrado de memória, iterações e paralelismo.
"""

from __future__ import annotations

import asyncio

from argon2 import PasswordHasher as Argon2Hasher
from argon2 import Type
from argon2.exceptions import (
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)

from src.core.config import get_settings


class PasswordHasher:
    """Encapsula operações criptográficas de hash e verificação com Argon2id."""

    def __init__(
        self,
        *,
        time_cost: int | None = None,
        memory_cost: int | None = None,
        parallelism: int | None = None,
    ) -> None:
        settings = get_settings()
        self._time_cost = time_cost or settings.ARGON2_TIME_COST
        self._memory_cost = memory_cost or settings.ARGON2_MEMORY_COST
        self._parallelism = parallelism or settings.ARGON2_PARALLELISM

        self._hasher = Argon2Hasher(
            time_cost=self._time_cost,
            memory_cost=self._memory_cost,
            parallelism=self._parallelism,
            type=Type.ID,
        )

    def hash(self, password: str) -> str:
        """Gera hash salgado seguro com Argon2id para uma senha em texto plano."""
        return self._hasher.hash(password)

    def verify(self, hashed_password: str, plain_password: str) -> bool:
        """Valida uma senha em texto plano contra o hash armazenado.

        Retorna True se válida, False se inválida ou corrompida.
        """
        try:
            return self._hasher.verify(hashed_password, plain_password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    def check_needs_rehash(self, hashed_password: str) -> bool:
        """Verifica se o hash precisa ser recalculado com parâmetros atualizados."""
        try:
            return self._hasher.check_needs_rehash(hashed_password)
        except (InvalidHashError, VerificationError):
            return True

    async def hash_async(self, password: str) -> str:
        """Gera o hash assincronamente em thread pool para evitar bloqueio do loop de eventos."""
        return await asyncio.to_thread(self.hash, password)

    async def verify_async(self, hashed_password: str, plain_password: str) -> bool:
        """Verifica a senha assincronamente em thread pool para evitar bloqueio do loop de eventos."""
        return await asyncio.to_thread(self.verify, hashed_password, plain_password)


# Instância global singleton para uso nos serviços de autenticação
password_hasher = PasswordHasher()
