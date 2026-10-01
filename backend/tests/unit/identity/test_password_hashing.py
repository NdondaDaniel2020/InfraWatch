"""Testes unitários para o PasswordHasher com algoritmo Argon2id (RFC 9106)."""

import pytest

from src.contexts.identity.security.password import PasswordHasher, password_hasher


def test_password_hash_format_argon2id() -> None:
    """Garante que as senhas são hasheadas com prefixo RFC $argon2id$."""
    secret = "SuperSecret_NOC_2026!"
    hashed = password_hasher.hash(secret)

    assert hashed.startswith("$argon2id$")
    assert secret not in hashed


def test_password_verification_success() -> None:
    """Valida que a verificação de senha idêntica retorna True."""
    secret = "P@ssw0rdSegura"
    hashed = password_hasher.hash(secret)

    assert password_hasher.verify(hashed, secret) is True


def test_password_verification_failure_with_wrong_password() -> None:
    """Valida que senha divergente retorna False."""
    hashed = password_hasher.hash("SenhaCorreta")

    assert password_hasher.verify(hashed, "SenhaIncorreta") is False


def test_password_verification_failure_with_corrupted_hash() -> None:
    """Valida que hashes corrompidos ou malformados retornam False de forma segura."""
    assert password_hasher.verify("hash_invalido_sem_formato", "qualquer") is False
    assert password_hasher.verify("$argon2id$v=19$m=65536,t=2,p=4$corrupted", "qualquer") is False


def test_check_needs_rehash() -> None:
    """Garante que a detecção de rehash identifica quando os parâmetros de custo foram alterados."""
    # Hasher padrão com custo memory=65536
    hasher_std = PasswordHasher(memory_cost=65536, time_cost=2, parallelism=4)
    hashed = hasher_std.hash("minhasenha")

    # Mesmos parâmetros: não precisa de rehash
    assert hasher_std.check_needs_rehash(hashed) is False

    # Hasher com parâmetros mais rigorosos (ex: elevação futura de segurança)
    hasher_stronger = PasswordHasher(memory_cost=131072, time_cost=3, parallelism=4)
    assert hasher_stronger.check_needs_rehash(hashed) is True


@pytest.mark.asyncio
async def test_async_password_hashing_and_verification() -> None:
    """Valida as chamadas assíncronas em thread pool não-bloqueante."""
    secret = "AsyncThreadSafePass_123"
    hashed = await password_hasher.hash_async(secret)

    assert hashed.startswith("$argon2id$")

    is_valid = await password_hasher.verify_async(hashed, secret)
    assert is_valid is True

    is_invalid = await password_hasher.verify_async(hashed, "Errada")
    assert is_invalid is False
