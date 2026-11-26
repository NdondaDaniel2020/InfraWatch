"""Testes unitários estendidos para GoogleAuthService (fluxos OAuth, validações e criação de usuário)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.contexts.iam.schemas.google import GoogleLoginRequest
from src.contexts.iam.services.google_auth_service import (
    GoogleAuthService,
    GoogleIdentityProvider,
    build_authorization_url,
    create_google_state,
    ensure_google_login_enabled,
    verify_google_state,
)


def test_google_state_and_auth_url() -> None:
    """Valida geração e validação de state OAuth 2.0 e URL de autorização."""
    from src.core.config import get_settings

    settings = get_settings()
    with (
        patch.object(settings, "GOOGLE_CLIENT_ID", "client-id-123"),
        patch.object(settings, "GOOGLE_LOGIN_ENABLED", True),
        patch.object(settings, "GOOGLE_REDIRECT_URI", "https://infrawatch.io/callback"),
        patch.object(settings, "GOOGLE_STATE_TTL_MINUTES", 10),
    ):
        ensure_google_login_enabled()

        state = create_google_state()
        assert len(state) > 10
        verify_google_state(state)

        url = build_authorization_url(state)
        assert "accounts.google.com" in url
        assert "client-id-123" in url
        assert state in url


@pytest.mark.asyncio
async def test_google_identity_provider_methods() -> None:
    """Valida métodos utilitários do GoogleIdentityProvider."""
    mock_client = AsyncMock()
    provider = GoogleIdentityProvider(client=mock_client)

    # _is_email_verified
    assert provider._is_email_verified({"email_verified": True}) is True
    assert provider._is_email_verified({"email_verified": "true"}) is True
    assert provider._is_email_verified({"email_verified": False}) is False

    await provider.aclose()


@pytest.mark.asyncio
async def test_google_auth_service_authenticate() -> None:
    """Valida authenticate com usuário existente e criação automática de novo usuário."""
    mock_session = AsyncMock()
    mock_provider = AsyncMock()

    service = GoogleAuthService(
        session=mock_session,
        provider=mock_provider,
    )
    service.user_repo = AsyncMock()
    service.audit_service = AsyncMock()

    mock_provider.exchange_code_for_id_token.return_value = "id_token_123"
    mock_provider.verify_id_token.return_value = {
        "sub": "google-sub-123",
        "email": "google_user@corp.ao",
        "email_verified": True,
        "name": "Google User",
    }

    # 1. Usuário já existente
    existing_user = MagicMock(
        id=uuid4(),
        email="google_user@corp.ao",
        is_active=True,
        google_id=None,
        full_name="",
        organization_id=uuid4(),
    )
    service.user_repo.get_by_google_id.return_value = None
    service.user_repo.get_by_email.return_value = existing_user

    service.token_service = AsyncMock()
    service.token_service.create_token_pair.return_value = MagicMock(
        access_token="acc123",
        refresh_token="ref123",
        token_type="Bearer",
        expires_in=900,
    )

    req = GoogleLoginRequest(code="code_abc", state="state_123")
    with patch("src.contexts.iam.services.google_auth_service.verify_google_state"):
        user, tokens = await service.authenticate(data=req)
        assert tokens.access_token == "acc123"
        assert existing_user.google_id == "google-sub-123"

    # 2. Usuário novo (auto-cadastro)
    service.user_repo.get_by_google_id.return_value = None
    service.user_repo.get_by_email.return_value = None
    new_user_mock = MagicMock(
        id=uuid4(),
        email="new_google_user@corp.ao",
        organization_id=None,
    )
    service.user_repo.save.return_value = new_user_mock
    mock_provider.verify_id_token.return_value = {
        "sub": "google-sub-456",
        "email": "new_google_user@corp.ao",
        "email_verified": True,
        "name": "New Google User",
    }
    with patch("src.contexts.iam.services.google_auth_service.verify_google_state"):
        user, tokens = await service.authenticate(data=req)
        assert user.id == new_user_mock.id
        service.user_repo.save.assert_called_once()
