"""Testes unitários dos schemas de autenticação (MfaChallengeResponse, TokenResponse, AuthResponse)."""

from datetime import UTC, datetime
from uuid import uuid4

from src.contexts.iam.schemas.auth import (
    AuthResponse,
    MfaChallengeResponse,
    TokenResponse,
    UserResponse,
)


def test_mfa_challenge_response_creation():
    """Valida a criação e os campos do schema MfaChallengeResponse."""
    challenge = MfaChallengeResponse(mfa_pending_token="pending-token-123")
    assert challenge.mfa_required is True
    assert challenge.mfa_pending_token == "pending-token-123"

    dumped = challenge.model_dump()
    assert dumped == {
        "mfa_required": True,
        "mfa_pending_token": "pending-token-123",
    }


def test_token_response_creation_without_user():
    """Valida criação do TokenResponse sem o campo opcional user (ex: /refresh)."""
    token_resp = TokenResponse(
        access_token="access-123",
        refresh_token="refresh-456",
        token_type="Bearer",
        expires_in=900,
    )
    assert token_resp.access_token == "access-123"
    assert token_resp.refresh_token == "refresh-456"
    assert token_resp.token_type == "Bearer"
    assert token_resp.expires_in == 900
    assert token_resp.user is None


def test_token_response_creation_with_user():
    """Valida criação do TokenResponse com o campo user preenchido (ex: /login)."""
    user_resp = UserResponse(
        id=uuid4(),
        email="operator@infrawatch.io",
        full_name="Operator User",
        role="OPERATOR",
        is_active=True,
        is_verified=True,
        mfa_enabled=False,
        created_at=datetime.now(UTC),
    )
    token_resp = TokenResponse(
        access_token="access-123",
        refresh_token="refresh-456",
        expires_in=900,
        user=user_resp,
    )
    assert token_resp.user is not None
    assert token_resp.user.email == "operator@infrawatch.io"
    assert token_resp.token_type == "Bearer"


def test_auth_response_backward_compatibility():
    """Valida que o schema legado AuthResponse mantém suporte para ambos os formatos."""
    # Formato desafio MFA
    mfa_auth = AuthResponse(mfa_required=True, mfa_pending_token="tok-mfa")
    assert mfa_auth.mfa_required is True
    assert mfa_auth.mfa_pending_token == "tok-mfa"
    assert mfa_auth.access_token is None

    # Formato com tokens
    token_auth = AuthResponse(
        access_token="acc",
        refresh_token="ref",
        expires_in=900,
    )
    assert token_auth.mfa_required is False
    assert token_auth.access_token == "acc"
