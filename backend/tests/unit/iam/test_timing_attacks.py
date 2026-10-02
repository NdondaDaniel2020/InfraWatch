"""Testes de mitigação de Timing Attacks e neutralidade de erros na autenticação (ADR-022 / Issue #10).

Valida:
1. Neutralidade de respostas: "Credenciais inválidas" tanto para usuário inexistente quanto para senha errada.
2. Comportamento temporal equivalente: ambas as falhas disparam cálculo completo de Argon2id.
3. Fluxo de autenticação bem-sucedido retornando usuário e par de tokens.
4. Usuários inativos tratados com neutralidade temporal e sem vazamento de existência.
"""

import time
from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.domain.models import UserModel
from src.contexts.iam.security.password import password_hasher
from src.contexts.iam.security.timing import (
    constant_time_verify,
    constant_time_verify_sync,
)
from src.contexts.iam.services.auth_service import (
    INVALID_CREDENTIALS_MSG,
    AuthService,
)
from src.core.database.base_model import Base
from src.core.exceptions import AuthenticationError


@pytest.fixture
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    """Cria engine SQLite assíncrona in-memory para isolamento de cada teste."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def valid_user(async_session: AsyncSession) -> UserModel:
    """Cria um usuário válido com hash Argon2id real."""
    user = UserModel(
        id=uuid4(),
        email="noc.analyst@infrawatch.io",
        hashed_password=password_hasher.hash("Corret4_S3nh4!"),
        full_name="Analista NOC",
        role=UserRole.NOC_OPERATOR,
        is_active=True,
    )
    async_session.add(user)
    await async_session.commit()
    return user


@pytest.mark.asyncio
async def test_error_message_neutrality(async_session: AsyncSession, valid_user: UserModel) -> None:
    """Garante que e-mails inexistentes e senhas erradas recebem mensagens de erro idênticas."""
    auth_service = AuthService(async_session)

    # 1. Falha com e-mail inexistente
    with pytest.raises(AuthenticationError) as exc_nonexistent:
        await auth_service.authenticate(
            email="naoexiste@infrawatch.io",
            password="QualquerSenha123",
            client_ip="10.0.0.1",
        )

    # 2. Falha com e-mail existente mas senha incorreta
    with pytest.raises(AuthenticationError) as exc_wrong_pass:
        await auth_service.authenticate(
            email=valid_user.email,
            password="SenhaErrada_123",
            client_ip="10.0.0.2",
        )

    assert str(exc_nonexistent.value) == INVALID_CREDENTIALS_MSG
    assert str(exc_wrong_pass.value) == INVALID_CREDENTIALS_MSG
    assert str(exc_nonexistent.value) == str(exc_wrong_pass.value)


@pytest.mark.asyncio
async def test_successful_authentication(
    async_session: AsyncSession, valid_user: UserModel
) -> None:
    """Valida que credenciais corretas autenticam com sucesso e emitem par de tokens."""
    auth_service = AuthService(async_session)

    user, token_pair = await auth_service.authenticate(
        email=valid_user.email,
        password="Corret4_S3nh4!",
        client_ip="10.0.0.5",
    )

    assert user.id == valid_user.id
    assert token_pair.access_token is not None
    assert token_pair.refresh_token is not None
    assert token_pair.token_type == "Bearer"


@pytest.mark.asyncio
async def test_inactive_user_treated_with_neutral_error(
    async_session: AsyncSession,
) -> None:
    """Usuários desativados devem receber a mesma mensagem genérica sem vazar estado."""
    inactive_user = UserModel(
        id=uuid4(),
        email="desativado@infrawatch.io",
        hashed_password=password_hasher.hash("SenhaValida123"),
        full_name="Usuario Inativo",
        role=UserRole.CLIENT_VIEWER,
        is_active=False,
    )
    async_session.add(inactive_user)
    await async_session.commit()

    auth_service = AuthService(async_session)

    with pytest.raises(AuthenticationError) as exc_inactive:
        await auth_service.authenticate(
            email="desativado@infrawatch.io",
            password="SenhaValida123",
            client_ip="10.0.0.9",
        )

    assert str(exc_inactive.value) == INVALID_CREDENTIALS_MSG


@pytest.mark.asyncio
async def test_timing_attack_mitigation_execution_parity() -> None:
    """Garante que a rota inexistente (candidate_hash=None) executa o ciclo completo do Argon2id.

    Medimos a execução com hash None vs com hash real:
    - Ambos devem demorar mais que 10ms (comprovando que não há retorno antecipado <1ms).
    """
    real_hash = password_hasher.hash("SenhaTeste_2026")
    test_password = "TentativaDeSenha"

    # Medição com candidate_hash=None (usuário inexistente)
    t0 = time.perf_counter()
    result_none = await constant_time_verify(None, test_password)
    t_none = time.perf_counter() - t0

    assert result_none is False
    # O hash Argon2id calibrado consome no mínimo 10ms (geralmente 30-70ms)
    assert t_none > 0.010, f"Tempo para hash None ({t_none * 1000:.2f}ms) foi rápido demais!"

    # Medição com candidate_hash real
    t1 = time.perf_counter()
    result_real = await constant_time_verify(real_hash, test_password)
    t_real = time.perf_counter() - t1

    assert result_real is False
    assert t_real > 0.010, f"Tempo para hash real ({t_real * 1000:.2f}ms) foi rápido demais!"


def test_sync_timing_attack_parity() -> None:
    """Garante paridade na versão síncrona de constant_time_verify_sync."""
    assert constant_time_verify_sync(None, "qualquer") is False
    real_hash = password_hasher.hash("pwd_sync")
    assert constant_time_verify_sync(real_hash, "errada") is False
    assert constant_time_verify_sync(real_hash, "pwd_sync") is True
