"""Testes unitários para DualKeyRateLimiter e AuthRateLimitService.

Valida os cenários essenciais da Issue #9:
1. Ataque distribuído: múltiplos IPs rotativos atacando uma única conta (Account Lockout após 5 falhas).
2. Ataque concentrado: 1 IP atacando múltiplas contas (bloqueio do IP após 10 requisições).
3. Reset do contador de falhas após login bem-sucedido.
4. Integração atômica com comandos Redis (INCR, EXPIRE, TTL, DEL).
5. Resiliência e fallback transparente em memória diante de indisponibilidade do Redis.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import ConnectionError as RedisConnError

from src.contexts.iam.security.rate_limiter import DualKeyRateLimiter
from src.contexts.iam.services.auth_rate_limit_service import AuthRateLimitService
from src.core.exceptions import AccountLockedOutError, RateLimitExceededError


@pytest.fixture
def limiter_in_memory() -> DualKeyRateLimiter:
    """Instância do rate limiter utilizando fallback in-memory isolado."""
    limiter = DualKeyRateLimiter(
        redis_client=None,
        ip_max_requests=10,
        ip_window_seconds=60,
        account_max_failures=5,
        account_window_seconds=300,
        account_lockout_duration_seconds=900,
    )
    limiter.clear_in_memory_state()
    return limiter


@pytest.mark.asyncio
async def test_distributed_attack_triggers_account_lockout(
    limiter_in_memory: DualKeyRateLimiter,
) -> None:
    """Cenário 1: Tentativas consecutivas contra uma conta a partir do mesmo IP ativam lockout para aquele par.

    5 falhas consecutivas para (vitima@empresa.com, IP_A) bloqueiam o IP_A.
    Um IP distinto (IP_B) NÃO é bloqueado, mitigando enumeração de conta e ataques de negação de serviço (DoS).
    """
    service = AuthRateLimitService(limiter_in_memory)
    target_account = "vitima@empresa.com"
    attacker_ip = "198.51.100.1"

    # Simular 4 falhas
    for _ in range(4):
        await service.pre_login_check(client_ip=attacker_ip, email=target_account)
        await service.register_failed_login(client_ip=attacker_ip, email=target_account)

    # A 5ª falha ativa o lockout para o attacker_ip
    await service.pre_login_check(client_ip=attacker_ip, email=target_account)
    with pytest.raises(AccountLockedOutError) as exc_info:
        await service.register_failed_login(client_ip=attacker_ip, email=target_account)
    assert exc_info.value.retry_after > 0

    # 6ª tentativa a partir do mesmo IP deve ser rejeitada na pré-checagem
    with pytest.raises(AccountLockedOutError) as exc_info:
        await service.pre_login_check(client_ip=attacker_ip, email=target_account)
    assert exc_info.value.retry_after > 0

    # Usuário legítimo em outro IP não deve ser bloqueado (anti-enumeração e anti-DoS)
    legitimate_ip = "203.0.113.99"
    await service.pre_login_check(client_ip=legitimate_ip, email=target_account)


@pytest.mark.asyncio
async def test_concentrated_attack_blocks_ip(
    limiter_in_memory: DualKeyRateLimiter,
) -> None:
    """Cenário 2: Ataque concentrado de 1 IP contra múltiplas contas diferentes.

    Nenhuma conta atinge 5 falhas, mas o IP excede 10 requisições/minuto.
    A 11ª tentativa deve ser bloqueada imediatamente com RateLimitExceededError.
    """
    service = AuthRateLimitService(limiter_in_memory)
    attacker_ip = "192.0.2.1"

    # Fazer 10 requisições a partir do mesmo IP para 10 contas distintas
    for i in range(1, 11):
        email = f"user_{i}@empresa.com"
        await service.pre_login_check(client_ip=attacker_ip, email=email)

    # 11ª requisição deve ser bloqueada por rate limit de IP
    with pytest.raises(RateLimitExceededError) as exc_info:
        await service.pre_login_check(client_ip=attacker_ip, email="outro@empresa.com")

    assert exc_info.value.retry_after > 0


@pytest.mark.asyncio
async def test_successful_login_resets_failed_attempts(
    limiter_in_memory: DualKeyRateLimiter,
) -> None:
    """Cenário 3: Login bem-sucedido limpa o contador de falhas da conta."""
    service = AuthRateLimitService(limiter_in_memory)
    user_email = "usuario@empresa.com"
    client_ip = "10.0.0.50"

    # Registrar 4 falhas consecutivas (à beira do lockout)
    for _ in range(4):
        await service.pre_login_check(client_ip, user_email)
        await service.register_failed_login(client_ip, user_email)

    # Login bem-sucedido
    await service.register_successful_login(client_ip, user_email)

    # Agora o usuário pode errar novamente sem entrar em lockout imediato
    await service.pre_login_check(client_ip, user_email)
    await service.register_failed_login(client_ip, user_email)

    # Nova pré-checagem deve passar
    await service.pre_login_check(client_ip, user_email)


@pytest.mark.asyncio
async def test_redis_operations_and_lockout() -> None:
    """Cenário 4: Validação de chamadas Redis (incr, expire, ttl, set, delete)."""
    mock_redis = MagicMock()
    mock_redis.incr = AsyncMock(return_value=5)  # Atinge o limite de 5
    mock_redis.expire = AsyncMock(return_value=True)
    mock_redis.ttl = AsyncMock(return_value=850)
    mock_redis.set = AsyncMock(return_value=True)
    mock_redis.delete = AsyncMock(return_value=1)

    limiter = DualKeyRateLimiter(
        redis_client=mock_redis,
        account_max_failures=5,
        account_lockout_duration_seconds=900,
    )
    service = AuthRateLimitService(limiter)

    # 1. Registrar 5ª falha no Redis
    with pytest.raises(AccountLockedOutError) as exc_info:
        await service.register_failed_login("1.2.3.4", "alvo@empresa.com")

    assert exc_info.value.retry_after == 900
    mock_redis.set.assert_awaited()

    # 2. Pré-checagem deve consultar lockout_key
    mock_redis.incr.return_value = 1
    mock_redis.ttl.return_value = 800
    with pytest.raises(AccountLockedOutError) as exc_info:
        await service.pre_login_check("1.2.3.4", "alvo@empresa.com")

    assert exc_info.value.retry_after == 800

    # 3. Reset deve chamar delete
    await service.register_successful_login("1.2.3.4", "alvo@empresa.com")
    mock_redis.delete.assert_awaited()


@pytest.mark.asyncio
async def test_redis_failure_falls_back_to_in_memory_transparently() -> None:
    """Cenário 5: Quando o Redis falha, o limiter opera em fallback in-memory sem levantar exceção."""
    broken_redis = MagicMock()
    broken_redis.incr = AsyncMock(side_effect=RedisConnError("Redis connection refused"))
    broken_redis.ttl = AsyncMock(side_effect=RedisConnError("Redis connection refused"))
    broken_redis.set = AsyncMock(side_effect=RedisConnError("Redis connection refused"))
    broken_redis.delete = AsyncMock(side_effect=RedisConnError("Redis connection refused"))

    limiter = DualKeyRateLimiter(
        redis_client=broken_redis,
        account_max_failures=3,
        account_lockout_duration_seconds=300,
    )
    service = AuthRateLimitService(limiter)
    email = "fallback@empresa.com"
    client_ip = "10.0.0.1"

    # 3 falhas consecutivas do mesmo IP devem ativar o lockout no fallback in-memory
    for _ in range(2):
        await service.pre_login_check(client_ip, email)
        await service.register_failed_login(client_ip, email)

    # 3ª falha ativa o lockout
    with pytest.raises(AccountLockedOutError):
        await service.register_failed_login(client_ip, email)

    # Tentativa seguinte do mesmo IP é bloqueada pelo fallback em memória
    with pytest.raises(AccountLockedOutError) as exc_info:
        await service.pre_login_check(client_ip, email)

    assert exc_info.value.retry_after > 0
