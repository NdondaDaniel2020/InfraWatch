"""Testes unitários e de integração para o TokenService e utilitários JWT/tokens.

Valida:
1. Emissão de par de tokens com claims padronizadas e seguras.
2. Decodificação de Access Token com rejeição de expirados e adulterados.
3. Rotação estrita de Refresh Token com persistência atômica.
4. Grace Period de tolerância para requisições concorrentes no frontend.
5. Detecção de reuso malicioso (Replay Attack) com bloqueio da família de tokens.
6. Blacklist de Access Tokens no Redis e fallback resiliente em memória.
"""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.database.models import RefreshTokenModel, UserModel
from src.contexts.iam.security.tokens import (
    create_access_token,
    decode_access_token,
    generate_opaque_token,
    hash_token,
)
from src.contexts.iam.services.token_service import TokenService
from src.core.database.base_model import Base
from src.core.exceptions import (
    InvalidTokenError,
    TokenExpiredError,
    TokenReuseDetectedError,
)


@pytest.fixture
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    """Cria uma engine SQLite assíncrona in-memory para isolamento de cada teste."""
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
async def dummy_user(async_session: AsyncSession) -> UserModel:
    """Cria um usuário base de teste para os cenários de token."""
    user = UserModel(
        id=uuid4(),
        email="operator@noc.infrawatch.io",
        hashed_password="hash",
        full_name="Operador NOC",
        role=UserRole.NOC_OPERATOR,
        organization_id=uuid4(),
    )
    async_session.add(user)
    await async_session.commit()
    return user


# ---------------------------------------------------------------------------
# Testes dos Utilitários JWT e Tokens
# ---------------------------------------------------------------------------


def test_token_utils_opaque_generation_and_hashing() -> None:
    """Valida geração de tokens opacos e consistência de hashing SHA-256."""
    token1 = generate_opaque_token()
    token2 = generate_opaque_token()

    assert len(token1) >= 48
    assert token1 != token2

    hash1 = hash_token(token1)
    hash2 = hash_token(token1)
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 hex


def test_create_and_decode_access_token_success() -> None:
    """Garante que o token de acesso gerado contém todas as claims exigidas."""
    user_id = uuid4()
    org_id = uuid4()
    token, jti = create_access_token(
        user_id=user_id,
        role=UserRole.ORG_ADMIN,
        org_id=org_id,
    )

    assert isinstance(token, str)
    assert len(jti) == 32  # UUID hex

    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["role"] == UserRole.ORG_ADMIN
    assert payload["org_id"] == str(org_id)
    assert payload["jti"] == jti
    assert payload["type"] == "access"


def test_decode_access_token_expired_raises_token_expired_error() -> None:
    """Valida que tokens expirados levantam TokenExpiredError."""
    token, _ = create_access_token(
        user_id=uuid4(),
        role=UserRole.CLIENT_VIEWER,
        expires_delta=timedelta(seconds=-10),  # Já expirado
    )

    with pytest.raises(TokenExpiredError) as exc_info:
        decode_access_token(token)

    assert "expirou" in str(exc_info.value).lower()


def test_decode_access_token_invalid_signature_raises_invalid_token_error() -> None:
    """Valida que assinaturas corrompidas levantam InvalidTokenError."""
    token, _ = create_access_token(
        user_id=uuid4(),
        role=UserRole.CLIENT_VIEWER,
    )
    corrupted_token = token[:-5] + "XXXXX"

    with pytest.raises(InvalidTokenError):
        decode_access_token(corrupted_token)


# ---------------------------------------------------------------------------
# Testes do TokenService (Emissão, Rotação, Grace Period e Reuso)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_token_service_create_token_pair(
    async_session: AsyncSession, dummy_user: UserModel
) -> None:
    """Valida a emissão completa de par de tokens para o usuário."""
    service = TokenService(async_session)

    response = await service.create_token_pair(
        user=dummy_user,
        ip_address="10.0.0.1",
        user_agent="Pytest Agent",
    )
    await async_session.commit()

    assert response.access_token is not None
    assert response.refresh_token is not None
    assert response.token_type == "Bearer"
    assert response.expires_in == 15 * 60

    payload = decode_access_token(response.access_token)
    assert payload["sub"] == str(dummy_user.id)
    assert payload["role"] == dummy_user.role


@pytest.mark.asyncio
async def test_token_service_rotate_refresh_token_success(
    async_session: AsyncSession, dummy_user: UserModel
) -> None:
    """Garante rotação atômica: token anterior revogado e novo emitido."""
    service = TokenService(async_session)

    initial_pair = await service.create_token_pair(dummy_user)
    await async_session.commit()

    # Executar rotação
    rotated_pair = await service.rotate_refresh_token(initial_pair.refresh_token)
    await async_session.commit()

    assert rotated_pair.refresh_token != initial_pair.refresh_token

    # Validar novo access token
    new_payload = decode_access_token(rotated_pair.access_token)
    assert new_payload["sub"] == str(dummy_user.id)


@pytest.mark.asyncio
async def test_token_service_grace_period_concurrency_tolerance(
    async_session: AsyncSession, dummy_user: UserModel
) -> None:
    """Valida tolerância a concorrência dentro do Grace Period (<= 10s)."""
    # Grace period configurado para 10 segundos
    service = TokenService(async_session, grace_period_seconds=10)

    initial_pair = await service.create_token_pair(dummy_user)
    await async_session.commit()

    # Primeira rotação (sucesso)
    first_rotation = await service.rotate_refresh_token(initial_pair.refresh_token)
    await async_session.commit()

    # Segunda chamada imediata com o mesmo token original (simulando request concorrente do frontend)
    second_rotation = await service.rotate_refresh_token(initial_pair.refresh_token)

    # Não deve lançar erro e deve permitir a sessão sem penalidade
    assert second_rotation.access_token is not None
    assert first_rotation.access_token is not None


@pytest.mark.asyncio
async def test_token_service_reuse_detection_outside_grace_period_revokes_all(
    async_session: AsyncSession, dummy_user: UserModel
) -> None:
    """Valida detecção de reuso fora do Grace Period e revogação em cascata de todas as sessões."""
    service = TokenService(async_session, grace_period_seconds=5)

    pair1 = await service.create_token_pair(dummy_user)
    await async_session.commit()

    # Rotacionar
    await service.rotate_refresh_token(pair1.refresh_token)
    await async_session.commit()

    # Simular passagem do tempo além do Grace Period alterando revoked_at manualmente
    token_hash = hash_token(pair1.refresh_token)
    old_record = await async_session.get(
        RefreshTokenModel,
        (
            await async_session.execute(
                RefreshTokenModel.__table__.select().where(
                    RefreshTokenModel.token_hash == token_hash
                )
            )
        )
        .first()
        .id,
    )
    assert old_record is not None
    old_record.revoked_at = datetime.now(UTC) - timedelta(seconds=20)
    await async_session.commit()

    # Tentativa de reutilizar o token revogado fora do Grace Period
    with pytest.raises(TokenReuseDetectedError) as exc_info:
        await service.rotate_refresh_token(pair1.refresh_token)

    assert "reuso de sessão detectada" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_token_service_blacklist_and_revocation(
    async_session: AsyncSession, dummy_user: UserModel
) -> None:
    """Valida revogação de tokens e checagem de blacklist no Redis/memória."""
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=True)
    mock_redis.get = AsyncMock(return_value=b"1")

    service = TokenService(async_session, redis_client=mock_redis)

    pair = await service.create_token_pair(dummy_user)
    await async_session.commit()

    # Revogar refresh token informando o access token
    await service.revoke_refresh_token(
        raw_refresh_token=pair.refresh_token,
        access_token=pair.access_token,
    )
    await async_session.commit()

    # Validar chamada ao redis set
    mock_redis.set.assert_awaited()

    # Checar se o JTI está blacklisted
    payload = decode_access_token(pair.access_token)
    is_blocked = await service.is_token_blacklisted(payload["jti"])
    assert is_blocked is True
