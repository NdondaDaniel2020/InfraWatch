"""Testes unitários diretos para os route handlers de autenticação (ADR-003, ADR-020)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.contexts.iam.api.routes.auth import (
    confirm_password_reset_endpoint,
    get_my_profile,
    login,
    login_form,
    login_mfa_challenge,
    logout,
    logout_all,
    refresh_token_endpoint,
    register,
    request_password_reset_endpoint,
    resend_verification_endpoint,
    verify_email_endpoint,
)
from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.auth import (
    EmailVerificationConfirm,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    ResendVerificationRequest,
    TokenResponse,
    UserResponse,
)
from src.contexts.iam.schemas.mfa import MfaChallengeRequest
from src.contexts.iam.schemas.user import UserCreate, UserPublicResponse
from src.core.exceptions import (
    AccountLockedOutError,
    AuthenticationError,
    EmailAlreadyExistsError,
    InvalidMfaChallengeError,
    InvalidMfaPendingTokenError,
    InvalidOrExpiredTokenError,
    NotFoundError,
    RateLimitExceededError,
    TokenExpiredError,
    TokenRevokedError,
)


@pytest.mark.asyncio
async def test_register_handler_success_and_forbidden() -> None:
    """Valida handler register com super_admin e com usuário sem permissão."""
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    mock_service = AsyncMock()
    user_id = uuid4()
    org_id = uuid4()
    mock_user_model = MagicMock(
        id=user_id,
        email="new@corp.ao",
        full_name="New User",
        role="CLIENT_VIEWER",
        is_active=True,
        is_verified=False,
        mfa_enabled=False,
        created_at=now,
        organization_id=org_id,
    )
    mock_service.register_user.return_value = (mock_user_model, "verify_token_123")

    valid_public_user = UserPublicResponse(
        id=user_id,
        email="new@corp.ao",
        full_name="New User",
        role="CLIENT_VIEWER",
        organization_id=org_id,
        organization_name=None,
        is_active=True,
        is_verified=False,
        mfa_enabled=False,
        mfa_type=None,
        created_at=now,
    )

    body = UserCreate(
        email="new@corp.ao",
        password="ValidSecret#987!_Strong",
        full_name="New User",
        role=UserRole.CLIENT_VIEWER,
    )

    # Super Admin
    super_admin = AuthenticatedUser(
        id=str(uuid4()),
        email="admin@corp.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=None,
    )
    with patch(
        "src.contexts.iam.api.routes.auth.UserPublicResponse.model_validate",
        return_value=valid_public_user,
    ):
        res = await register(
            body=body,
            user_command_service=mock_service,
            current_user=super_admin,
        )
        assert res.email == "new@corp.ao"

    # Org Admin tentando cadastrar usuário em outra organização (forbidden)
    org_admin = AuthenticatedUser(
        id=str(uuid4()),
        email="org@corp.ao",
        role=UserRole.ORG_ADMIN.value,
        organization_id=str(org_id),
    )
    bad_body = UserCreate(
        email="bad@corp.ao",
        password="ValidSecret#987!_Strong",
        full_name="Bad",
        organization_id=uuid4(),
        role=UserRole.CLIENT_VIEWER,
    )
    with pytest.raises(HTTPException) as exc_info:
        await register(
            body=bad_body,
            user_command_service=mock_service,
            current_user=org_admin,
        )
    assert exc_info.value.status_code == 403

    # Org Admin tentando cadastrar sem organization_id
    org_admin_no_org = AuthenticatedUser(
        id=str(uuid4()),
        email="org2@corp.ao",
        role=UserRole.ORG_ADMIN.value,
        organization_id=None,
    )
    with pytest.raises(HTTPException) as exc_info2:
        await register(
            body=body,
            user_command_service=mock_service,
            current_user=org_admin_no_org,
        )
    assert exc_info2.value.status_code == 403

    # Email duplicado
    mock_service.register_user.side_effect = EmailAlreadyExistsError("Email ja existe")
    with pytest.raises(HTTPException) as exc_info3:
        await register(
            body=body,
            user_command_service=mock_service,
            current_user=super_admin,
        )
    assert exc_info3.value.status_code == 409


@pytest.mark.asyncio
async def test_login_and_login_form_handlers() -> None:
    """Valida endpoints de login e login-form (direto e tratamento de exceções)."""
    from datetime import UTC, datetime

    now = datetime.now(UTC)

    mock_service = AsyncMock()
    mock_req = MagicMock()
    mock_req.headers.get.return_value = "pytest-agent"

    token_res = TokenResponse(
        access_token="acc",
        refresh_token="ref",
        token_type="Bearer",
        expires_in=900,
    )
    mock_user = MagicMock(mfa_enabled=False)
    mock_service.authenticate.return_value = (mock_user, token_res)

    valid_user_response = UserResponse(
        id=uuid4(),
        email="u@corp.ao",
        full_name="User",
        role="CLIENT_VIEWER",
        organization_id=None,
        is_active=True,
        is_verified=True,
        mfa_enabled=False,
        created_at=now,
    )

    with patch(
        "src.contexts.iam.api.routes.auth.UserResponse.model_validate",
        return_value=valid_user_response,
    ):
        # 1. Login sucesso
        res = await login(
            body=LoginRequest(email="u@corp.ao", password="Password123!"),
            request=mock_req,
            client_ip="127.0.0.1",
            auth_service=mock_service,
        )
        assert res.access_token == "acc"

        # 2. Login-form sucesso
        form_data = MagicMock(username="u@corp.ao", password="Password123!")
        res_form = await login_form(
            form_data=form_data,
            request=mock_req,
            client_ip="127.0.0.1",
            auth_service=mock_service,
        )
        assert res_form.access_token == "acc"

    # 3. Exceções mapeadas
    exceptions_map = [
        (AuthenticationError("Credenciais"), 401),
        (AccountLockedOutError("Bloqueada"), 429),
        (RateLimitExceededError("Muitas tentativas"), 429),
    ]
    for exc, expected_status in exceptions_map:
        mock_service.authenticate.side_effect = exc
        with pytest.raises(HTTPException) as err:
            await login(
                body=LoginRequest(email="u@corp.ao", password="bad"),
                request=mock_req,
                client_ip="127.0.0.1",
                auth_service=mock_service,
            )
        assert err.value.status_code == expected_status


@pytest.mark.asyncio
async def test_login_mfa_challenge_handler() -> None:
    """Valida resolução de MFA challenge no login."""
    from datetime import UTC, datetime

    now = datetime.now(UTC)

    mock_service = AsyncMock()
    mock_req = MagicMock()
    mock_req.headers.get.return_value = "pytest-agent"

    token_res = TokenResponse(
        access_token="acc",
        refresh_token="ref",
        token_type="Bearer",
        expires_in=900,
    )
    mock_user = MagicMock(
        id=uuid4(),
        email="mfa@corp.ao",
        full_name="MFA User",
        role=UserRole.CLIENT_VIEWER,
        is_active=True,
        is_verified=True,
        mfa_enabled=True,
        organization_id=None,
    )
    mock_service.authenticate_mfa_challenge.return_value = (mock_user, token_res)

    valid_user_response = UserResponse(
        id=uuid4(),
        email="mfa@corp.ao",
        full_name="MFA User",
        role="CLIENT_VIEWER",
        organization_id=None,
        is_active=True,
        is_verified=True,
        mfa_enabled=True,
        created_at=now,
    )

    body = MfaChallengeRequest(mfa_pending_token="token_mfa", code="123456")
    with patch(
        "src.contexts.iam.api.routes.auth.UserResponse.model_validate",
        return_value=valid_user_response,
    ):
        res = await login_mfa_challenge(
            body=body,
            request=mock_req,
            client_ip="127.0.0.1",
            auth_service=mock_service,
        )
        assert res.access_token == "acc"

    # Exceções
    for exc, code in [
        (InvalidMfaPendingTokenError("Invalido"), 401),
        (InvalidMfaChallengeError("Invalido"), 401),
    ]:
        mock_service.authenticate_mfa_challenge.side_effect = exc
        with pytest.raises(HTTPException) as err:
            await login_mfa_challenge(
                body=body,
                request=mock_req,
                client_ip="127.0.0.1",
                auth_service=mock_service,
            )
        assert err.value.status_code == code


@pytest.mark.asyncio
async def test_refresh_token_handler() -> None:
    """Valida refresh_token_endpoint com sucesso e exceções."""
    mock_token_svc = AsyncMock()
    mock_req = MagicMock()
    mock_req.headers.get.return_value = "agent"

    token_res = TokenResponse(
        access_token="acc2",
        refresh_token="ref2",
        token_type="Bearer",
        expires_in=900,
    )
    mock_token_svc.rotate_refresh_token.return_value = token_res

    body = RefreshTokenRequest(refresh_token="ref_orig")
    res = await refresh_token_endpoint(
        body=body,
        request=mock_req,
        client_ip="127.0.0.1",
        token_service=mock_token_svc,
    )
    assert res == token_res

    for exc, code in [
        (TokenExpiredError("Expirado"), 401),
        (TokenRevokedError("Revogado"), 401),
        (AuthenticationError("Invalido"), 401),
    ]:
        mock_token_svc.rotate_refresh_token.side_effect = exc
        with pytest.raises(HTTPException) as err:
            await refresh_token_endpoint(
                body=body,
                request=mock_req,
                client_ip="127.0.0.1",
                token_service=mock_token_svc,
            )
        assert err.value.status_code == code


@pytest.mark.asyncio
async def test_logout_and_logout_all() -> None:
    """Valida encerramento de sessão individual e de todas as sessões."""
    mock_token_svc = AsyncMock()
    mock_sess_svc = AsyncMock()
    mock_sess_svc.revoke_all_sessions.return_value = 3

    current_user = AuthenticatedUser(
        id=str(uuid4()),
        email="user@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
    )

    res_logout = await logout(
        body=RefreshTokenRequest(refresh_token="ref"),
        current_user=current_user,
        token_service=mock_token_svc,
    )
    assert res_logout["status"] == "ok"
    mock_token_svc.revoke_refresh_token.assert_called_once()

    res_all = await logout_all(
        current_user=current_user,
        session_service=mock_sess_svc,
    )
    assert "3 sessão(ões)" in res_all["message"]


@pytest.mark.asyncio
async def test_email_verification_and_password_reset_endpoints() -> None:
    """Valida endpoints de confirmação de email e recuperação de senha."""
    mock_auth_svc = AsyncMock()

    # 1. verify_email_endpoint sucesso e erros
    res_v = await verify_email_endpoint(
        body=EmailVerificationConfirm(token="token123"),
        auth_service=mock_auth_svc,
    )
    assert res_v["status"] == "ok"

    mock_auth_svc.verify_email.side_effect = InvalidOrExpiredTokenError("Expirado")
    with pytest.raises(HTTPException) as err1:
        await verify_email_endpoint(
            body=EmailVerificationConfirm(token="token123"),
            auth_service=mock_auth_svc,
        )
    assert err1.value.status_code == 400

    mock_auth_svc.verify_email.side_effect = NotFoundError("Não encontrado")
    with pytest.raises(HTTPException) as err2:
        await verify_email_endpoint(
            body=EmailVerificationConfirm(token="token123"),
            auth_service=mock_auth_svc,
        )
    assert err2.value.status_code == 404

    # 2. resend_verification_endpoint
    res_resend = await resend_verification_endpoint(
        body=ResendVerificationRequest(email="u@corp.ao"),
        auth_service=mock_auth_svc,
    )
    assert res_resend["status"] == "ok"

    # 3. request_password_reset_endpoint
    res_reset_req = await request_password_reset_endpoint(
        body=PasswordResetRequest(email="u@corp.ao"),
        auth_service=mock_auth_svc,
    )
    assert res_reset_req["status"] == "ok"

    # 4. confirm_password_reset_endpoint sucesso e erros
    mock_auth_svc.reset_password.side_effect = None
    res_conf = await confirm_password_reset_endpoint(
        body=PasswordResetConfirm(token="tok", new_password="NewPass123!"),
        auth_service=mock_auth_svc,
    )
    assert res_conf["status"] == "ok"

    mock_auth_svc.reset_password.side_effect = InvalidOrExpiredTokenError("Token")
    with pytest.raises(HTTPException) as err3:
        await confirm_password_reset_endpoint(
            body=PasswordResetConfirm(token="tok", new_password="NewPass123!"),
            auth_service=mock_auth_svc,
        )
    assert err3.value.status_code == 400

    mock_auth_svc.reset_password.side_effect = NotFoundError("User")
    with pytest.raises(HTTPException) as err4:
        await confirm_password_reset_endpoint(
            body=PasswordResetConfirm(token="tok", new_password="NewPass123!"),
            auth_service=mock_auth_svc,
        )
    assert err4.value.status_code == 404


@pytest.mark.asyncio
async def test_get_my_profile_handler() -> None:
    """Valida handler de perfil /me com sucesso e not found."""
    mock_query_svc = AsyncMock()
    user_id = uuid4()
    current_user = AuthenticatedUser(
        id=str(user_id),
        email="me@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
    )

    from datetime import UTC, datetime

    now = datetime.now(UTC)
    mock_profile = MagicMock(
        id=user_id,
        email="me@corp.ao",
        full_name="Me",
        role=UserRole.CLIENT_VIEWER,
        is_active=True,
        is_verified=True,
        mfa_enabled=False,
        organization_id=None,
        created_at=now,
        updated_at=now,
    )
    mock_query_svc.get_user_by_id.return_value = mock_profile

    res = await get_my_profile(
        current_user=current_user,
        user_query_service=mock_query_svc,
    )
    assert res.email == "me@corp.ao"

    mock_query_svc.get_user_by_id.side_effect = NotFoundError("User")
    with pytest.raises(HTTPException) as err:
        await get_my_profile(
            current_user=current_user,
            user_query_service=mock_query_svc,
        )
    assert err.value.status_code == 404
