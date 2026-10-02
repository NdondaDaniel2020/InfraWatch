"""Testes unitários para a dependência unificada de autenticação (src.api.dependencies.auth)."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from src.api.dependencies.auth import AuthenticatedUser, get_current_user
from src.contexts.identity.domain.enums import UserRole
from src.core.config import get_settings
from src.core.security.tokens import create_access_token


def make_valid_token(
    user_id: str = "usr-123",
    email: str = "user@infrawatch.ao",
    role: str = "CLIENT_VIEWER",
    organization_id: str | None = "org-1",
) -> str:
    return create_access_token(
        data={
            "sub": user_id,
            "email": email,
            "role": role,
            "organization_id": organization_id,
        }
    )


class TestUnifiedAuthDependency:
    """Valida todas as vias de resolução de token em get_current_user."""

    @pytest.mark.asyncio
    async def test_auth_via_oauth2_token_bearer(self) -> None:
        token = make_valid_token(user_id="user-bearer", role="ORG_ADMIN")
        user = await get_current_user(token_bearer=token)
        assert user.id == "user-bearer"
        assert user.role == "ORG_ADMIN"
        assert user.organization_id == "org-1"

    @pytest.mark.asyncio
    async def test_auth_via_authorization_header_with_bearer_prefix(self) -> None:
        token = make_valid_token(user_id="user-hdr-bearer")
        user = await get_current_user(authorization=f"Bearer {token}")
        assert user.id == "user-hdr-bearer"

    @pytest.mark.asyncio
    async def test_auth_via_authorization_header_raw_token(self) -> None:
        token = make_valid_token(user_id="user-raw")
        user = await get_current_user(authorization=token)
        assert user.id == "user-raw"

    @pytest.mark.asyncio
    async def test_auth_via_query_param(self) -> None:
        token = make_valid_token(user_id="user-query")
        user = await get_current_user(token_query=token)
        assert user.id == "user-query"

    @pytest.mark.asyncio
    async def test_missing_all_tokens_raises_401(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token_bearer=None, token_query=None, authorization=None)
        assert exc_info.value.status_code == 401
        assert "Autenticação necessária" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_expired_token_raises_401(self) -> None:
        settings = get_settings()
        expired_payload = {
            "sub": "user-expired",
            "exp": datetime.now(UTC) - timedelta(minutes=10),
        }
        expired_token = jwt.encode(
            expired_payload,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token_bearer=expired_token)
        assert exc_info.value.status_code == 401
        assert "expirado" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_invalid_token_signature_raises_401(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token_bearer="invalid.token.payload")
        assert exc_info.value.status_code == 401
        assert "inválido ou corrompido" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_token_without_sub_raises_401(self) -> None:
        settings = get_settings()
        payload_without_sub = {
            "type": "access",
            "email": "no_sub@infrawatch.ao",
            "exp": datetime.now(UTC) + timedelta(minutes=15),
        }
        token = jwt.encode(
            payload_without_sub,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token_bearer=token)
        assert exc_info.value.status_code == 401
        assert "identificador de usuário ausente" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_authenticated_user_permissions_and_helpers(self) -> None:
        admin_user = AuthenticatedUser(
            id="admin-1",
            email="admin@infrawatch.ao",
            role=UserRole.SUPER_ADMIN.value,
            organization_id=None,
        )
        assert admin_user.is_super_admin is True
        assert admin_user.can_access_organization("any-org") is True

        client_user = AuthenticatedUser(
            id="client-1",
            email="client@empresa.ao",
            role=UserRole.CLIENT_VIEWER.value,
            organization_id="org-acme",
        )
        assert client_user.is_super_admin is False
        assert client_user.can_access_organization("org-acme") is True
        assert client_user.can_access_organization("other-org") is False
        assert client_user.can_access_organization(None) is True
