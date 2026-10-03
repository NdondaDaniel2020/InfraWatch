"""Testes de integração para Lock Distribuído e TokenCleanupWorker (ADR-024 / Issue #12).

Valida os critérios de aceite:
1. Apenas um worker consegue adquirir o lock e executar a rotina em concorrência crítica.
2. Queda abrupta do worker libera o lock automaticamente após o timeout do TTL.
3. Liberação segura via script Lua: outro worker não tem seu lock excluído acidentalmente.
4. TokenCleanupWorker realiza expurgo de tokens obsoletos no banco com rollback e transação segura.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.domain.enums import OrgTier, UserRole
from src.contexts.iam.domain.models import (
    OrganizationModel,
    RefreshTokenModel,
    UserModel,
)
from src.core.database.base_model import Base
from src.core.redis.distributed_lock import (
    DistributedLock,
    redis_distributed_lock,
)
from workers.daemons.token_cleanup_worker import TokenCleanupWorker


class FakeRedisClient:
    """Simulador de alta precisão do servidor Redis para locks distribuídos e scripts Lua."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float]] = {}  # key -> (owner_id, expires_at)
        self._lock = asyncio.Lock()

    async def set(
        self,
        name: str,
        value: str,
        nx: bool = False,
        ex: int | None = None,
    ) -> bool | None:
        """Emula `SET name value NX EX ex`."""
        async with self._lock:
            now = asyncio.get_event_loop().time()
            # Se a chave existe e ainda não expirou
            if name in self._data:
                _, expires_at = self._data[name]
                if expires_at > now and nx:
                    return None  # Não adquire

            ttl = float(ex) if ex is not None else float("inf")
            self._data[name] = (value, now + ttl)
            return True

    async def eval(
        self,
        script: str,
        numkeys: int,
        key: str,
        expected_owner: str,
    ) -> int:
        """Emula a execução do script Lua de liberação atômica."""
        async with self._lock:
            now = asyncio.get_event_loop().time()
            if key in self._data:
                current_owner, expires_at = self._data[key]
                # Se expirou ou o dono é diferente, não deleta
                if expires_at > now and current_owner == expected_owner:
                    del self._data[key]
                    return 1
            return 0


@pytest.fixture
def fake_redis() -> FakeRedisClient:
    return FakeRedisClient()


@pytest.fixture
async def test_db_session_factory() -> async_sessionmaker[AsyncSession]:
    """Cria banco SQLite em memória com os esquemas da aplicação."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # Popula dados de base (organização e usuário de teste)
    async with session_factory() as session, session.begin():
        org = OrganizationModel(
            id=uuid4(),
            name="NOC Telecom",
            slug="noc-telecom",
            tier=OrgTier.ENTERPRISE_GOLD,
        )
        session.add(org)
        user = UserModel(
            id=uuid4(),
            email="noc@telecom.ao",
            full_name="Analista NOC",
            role=UserRole.NOC_OPERATOR,
            hashed_password="argon2id$dummy",
            organization_id=org.id,
        )
        session.add(user)

    return session_factory


@pytest.mark.asyncio
async def test_concurrent_workers_only_one_acquires_lock(fake_redis: FakeRedisClient) -> None:
    """Critério 1: Simula 3 workers tentando executar a mesma tarefa ao mesmo tempo.

    Apenas 1 worker consegue adquirir o lock e executar a rotina.
    """
    execution_counter = 0
    lock_name = "test_critical_task"

    async def worker_routine(worker_id: int) -> bool:
        nonlocal execution_counter
        async with redis_distributed_lock(
            fake_redis,  # type: ignore[arg-type]
            key=lock_name,
            timeout=10,
            blocking=False,
        ) as lock:
            if not lock.acquired:
                return False

            # Simula trabalho sob o lock
            execution_counter += 1
            await asyncio.sleep(0.05)
            return True

    # 3 workers disparados concorrentemente
    results = await asyncio.gather(
        worker_routine(1),
        worker_routine(2),
        worker_routine(3),
    )

    assert results.count(True) == 1, "Exatamente um worker deve ter adquirido o lock!"
    assert results.count(False) == 2, "Os outros 2 workers devem ter abortado imediatamente!"
    assert execution_counter == 1, "A tarefa deve ter sido executada exatamente uma vez!"


@pytest.mark.asyncio
async def test_worker_crash_releases_lock_after_ttl_timeout(fake_redis: FakeRedisClient) -> None:
    """Critério 2: Queda abrupta do worker libera o lock automaticamente após o timeout do TTL."""
    lock_key = "lock:crashed_worker"

    # Worker 1 adquire o lock com TTL de 1 segundo e 'cai' (não libera)
    lock1 = DistributedLock(
        redis_client=fake_redis,  # type: ignore[arg-type]
        key=lock_key,
        timeout=1,
        blocking=False,
    )
    acquired1 = await lock1.acquire()
    assert acquired1 is True
    # O Worker 1 'cai' sem chamar lock1.release()

    # Worker 2 tenta adquirir imediatamente -> deve falhar
    lock2 = DistributedLock(
        redis_client=fake_redis,  # type: ignore[arg-type]
        key=lock_key,
        timeout=10,
        blocking=False,
    )
    acquired2_early = await lock2.acquire()
    assert acquired2_early is False

    # Aguarda o TTL expirar
    await asyncio.sleep(1.05)

    # Agora Worker 2 deve conseguir adquirir após expiração do TTL
    acquired2_after = await lock2.acquire()
    assert acquired2_after is True
    await lock2.release()


@pytest.mark.asyncio
async def test_lua_script_prevents_accidental_lock_deletion(fake_redis: FakeRedisClient) -> None:
    """Garante que script Lua impede que um worker libere o lock que já pertence a outro worker."""
    lock_key = "lock:reassigned_resource"

    # Worker 1 adquire com TTL curto
    lock1 = DistributedLock(
        redis_client=fake_redis,  # type: ignore[arg-type]
        key=lock_key,
        timeout=1,
        blocking=False,
    )
    await lock1.acquire()

    # Tempo passa e o lock expira
    await asyncio.sleep(1.05)

    # Worker 2 assume o lock expirado
    lock2 = DistributedLock(
        redis_client=fake_redis,  # type: ignore[arg-type]
        key=lock_key,
        timeout=10,
        blocking=False,
    )
    acquired2 = await lock2.acquire()
    assert acquired2 is True

    # Worker 1 atrasado tenta liberar o seu lock antigo
    released1 = await lock1.release()
    assert released1 is False, "Worker 1 não pode liberar o lock pertencente ao Worker 2!"

    # O lock do Worker 2 permanece íntegro
    released2 = await lock2.release()
    assert released2 is True, "Worker 2 deve liberar seu próprio lock normalmente!"


@pytest.mark.asyncio
async def test_token_cleanup_worker_with_database(
    fake_redis: FakeRedisClient,
    test_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Testa o ciclo do TokenCleanupWorker expurgando tokens expirados e revogados antigos."""
    async with test_db_session_factory() as session:
        user_res = await session.execute(select(UserModel))
        user = user_res.scalars().first()
        assert user is not None

        now = datetime.now(UTC)

        # 1. Token expirado por data
        t1 = RefreshTokenModel(
            id=uuid4(),
            user_id=user.id,
            token_hash="hash_expired",
            expires_at=now - timedelta(days=2),
            is_revoked=False,
        )
        # 2. Token revogado há mais de 7 dias
        t2 = RefreshTokenModel(
            id=uuid4(),
            user_id=user.id,
            token_hash="hash_revoked_old",
            expires_at=now + timedelta(days=5),
            is_revoked=True,
            revoked_at=now - timedelta(days=10),
        )
        # 3. Token válido e ativo
        t3 = RefreshTokenModel(
            id=uuid4(),
            user_id=user.id,
            token_hash="hash_valid",
            expires_at=now + timedelta(days=5),
            is_revoked=False,
        )
        # 4. Token revogado recentemente (dentro da janela de retenção de 7 dias)
        t4 = RefreshTokenModel(
            id=uuid4(),
            user_id=user.id,
            token_hash="hash_revoked_recent",
            expires_at=now + timedelta(days=5),
            is_revoked=True,
            revoked_at=now - timedelta(days=1),
        )

        session.add_all([t1, t2, t3, t4])
        await session.commit()

    worker = TokenCleanupWorker(
        redis_client=fake_redis,  # type: ignore[arg-type]
        session_factory=test_db_session_factory,
        interval_seconds=60,
        lock_timeout=30,
        retention_days=7,
    )

    deleted_count = await worker.run_once()
    assert deleted_count == 2, (
        "Devem ter sido expurgados exatamente 2 tokens (o expirado e o revogado antigo)!"
    )

    # Verifica os tokens remanescentes no banco
    async with test_db_session_factory() as session:
        res = await session.execute(select(RefreshTokenModel))
        remaining_tokens = res.scalars().all()
        assert len(remaining_tokens) == 2
        remaining_hashes = {t.token_hash for t in remaining_tokens}
        assert "hash_valid" in remaining_hashes
        assert "hash_revoked_recent" in remaining_hashes


@pytest.mark.asyncio
async def test_concurrent_token_cleanup_workers(
    fake_redis: FakeRedisClient,
    test_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante que entre 3 workers de limpeza concorrentes, apenas 1 executa e os outros ignoram."""
    w1 = TokenCleanupWorker(
        redis_client=fake_redis,  # type: ignore[arg-type]
        session_factory=test_db_session_factory,
    )
    w2 = TokenCleanupWorker(
        redis_client=fake_redis,  # type: ignore[arg-type]
        session_factory=test_db_session_factory,
    )
    w3 = TokenCleanupWorker(
        redis_client=fake_redis,  # type: ignore[arg-type]
        session_factory=test_db_session_factory,
    )

    results = await asyncio.gather(
        w1.run_once(),
        w2.run_once(),
        w3.run_once(),
    )

    # Apenas um retorna int (quantidade deletada >= 0), os outros retornam None
    acquired_results = [r for r in results if r is not None]
    skipped_results = [r for r in results if r is None]

    assert len(acquired_results) == 1, "Exatamente um worker deve ter adquirido o lock!"
    assert len(skipped_results) == 2, (
        "Os outros 2 workers devem ter pulado a execução (retornando None)!"
    )
