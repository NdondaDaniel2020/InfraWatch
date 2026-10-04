"""Testes unitários para validação do TTL dos tokens de redefinição de senha e verificação de e-mail."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from contexts.iam.database.models import UserModel
from src.contexts.iam.services.auth_service import AuthService
from src.core.config import Settings


@pytest.fixture
def mock_user():
    return UserModel(
        id=uuid4(),
        email="test@infrawatch.ao",
        hashed_password="hashed_pw",
        full_name="Test User",
        is_active=True,
        is_verified=False,
    )


@pytest.mark.asyncio
async def test_password_reset_ttl_defaults_to_15_minutes(mock_user):
    """Valida que o token de recuperação de senha expira em 15 minutos por padrão (OWASP)."""
    service = AuthService(session=AsyncMock())
    service.user_repo = AsyncMock()
    service.user_repo.get_by_email.return_value = mock_user
    service.password_reset_repo = AsyncMock()

    before_call = datetime.now(UTC)
    raw_token = await service.request_password_reset(email="test@infrawatch.ao")
    after_call = datetime.now(UTC)

    assert raw_token is not None
    assert service.password_reset_repo.create.called

    call_kwargs = service.password_reset_repo.create.call_args[1]
    expires_at = call_kwargs["expires_at"]

    # Deve expirar entre before + 15 min e after + 15 min
    expected_min = before_call + timedelta(minutes=15)
    expected_max = after_call + timedelta(minutes=15)
    assert expected_min <= expires_at <= expected_max


@pytest.mark.asyncio
async def test_password_reset_ttl_custom_settings(mock_user):
    """Valida que o TTL de redefinição de senha é configurável via Settings."""
    service = AuthService(session=AsyncMock())
    service.user_repo = AsyncMock()
    service.user_repo.get_by_email.return_value = mock_user
    service.password_reset_repo = AsyncMock()

    custom_settings = Settings(
        ENVIRONMENT="test",
        PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=45,
    )

    with patch("src.contexts.iam.services.auth_service.get_settings", return_value=custom_settings):
        before_call = datetime.now(UTC)
        raw_token = await service.request_password_reset(email="test@infrawatch.ao")
        after_call = datetime.now(UTC)

        assert raw_token is not None
        call_kwargs = service.password_reset_repo.create.call_args[1]
        expires_at = call_kwargs["expires_at"]

        expected_min = before_call + timedelta(minutes=45)
        expected_max = after_call + timedelta(minutes=45)
        assert expected_min <= expires_at <= expected_max


@pytest.mark.asyncio
async def test_email_verification_ttl_matches_settings(mock_user):
    """Valida que o token de confirmação de e-mail expira em 24h por padrão e é parametrizável."""
    service = AuthService(session=AsyncMock())
    service.user_repo = AsyncMock()
    service.user_repo.get_by_email.return_value = mock_user
    service.email_token_repo = AsyncMock()

    before_call = datetime.now(UTC)
    raw_token = await service.resend_verification_email(email="test@infrawatch.ao")
    after_call = datetime.now(UTC)

    assert raw_token is not None
    call_kwargs = service.email_token_repo.create.call_args[1]
    expires_at = call_kwargs["expires_at"]

    expected_min = before_call + timedelta(hours=24)
    expected_max = after_call + timedelta(hours=24)
    assert expected_min <= expires_at <= expected_max
