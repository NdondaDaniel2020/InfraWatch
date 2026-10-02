"""Testes unitários e de integração para autenticação social Google OAuth 2.0 / OpenID Connect."""

from __future__ import annotations

import time
from collections.abc import AsyncGenerator

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.contexts.identity.domain.enums import UserRole
from src.contexts.identity.domain.models import AuditLogModel
from src.contexts.identity.repositories.user_repository import UserRepository
from src.contexts.identity.schemas.google import GoogleLoginRequest
from src.contexts.identity.services.google_auth_service import (
    GoogleAuthService,
    build_authorization_url,
    create_google_state,
    verify_google_state,
)
from src.core.config import get_settings
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
from src.core.exceptions import (
    GoogleAuthError,
    GoogleLoginDisabledError,
    InvalidGoogleTokenError,
)

TEST_GOOGLE_EMAIL = "google_user@infrawatch.ao"
TEST_GOOGLE_SUB = "google-oauth2-sub-987654"


class FakeGoogleIdentityProvider:
    """Dublê de teste para GoogleIdentityProvider sem chamadas de rede externas."""

    def __init__(self) -> None:
        self.claims: dict = {
            "iss": "https://accounts.google.com",
            "aud": "mock-client-id",
            "sub": TEST_GOOGLE_SUB,
            "email": TEST_GOOGLE_EMAIL,
            "email_verified": True,
            "name": "Google Test User",
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
        }
        self.exchange_error: Exception | None = None
        self.verify_error: Exception | None = None

    async def exchange_code_for_id_token(self, code: str) -> str:
        if self.exchange_error is not None:
            raise self.exchange_error
        return "fake-google-id-token"

    async def verify_id_token(self, id_token: str) -> dict:
        if self.verify_error is not None:
            raise self.verify_error
        return self.claims

    async def aclose(self) -> None:
        pass


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Cria banco SQLite em memória isolado."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


class TestGoogleStateAndUrl:
    """Valida a emissão e verificação do estado CSRF assinado e construção de URL."""

    def test_create_and_verify_google_state_success(self) -> None:
        state = create_google_state()
        assert isinstance(state, str)
        assert len(state) > 10

        # Verificação deve passar sem exceções
        verify_google_state(state)

    def test_verify_google_state_invalid_raises_error(self) -> None:
        with pytest.raises(InvalidGoogleTokenError):
            verify_google_state("invalid-tampered-token")

    def test_build_authorization_url_contains_required_params(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
        monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "http://localhost:8000/callback")

        state = "state-token-123"
        url = build_authorization_url(state)

        assert "https://accounts.google.com/o/oauth2/v2/auth" in url
        assert "client_id=test-client-id.apps.googleusercontent.com" in url
        assert "response_type=code" in url
        assert "state=state-token-123" in url
        assert "scope=openid+email+profile" in url


class TestGoogleLoginRequestValidation:
    """Valida regras de negócio do payload GoogleLoginRequest."""

    def test_require_exactly_one_credential(self) -> None:
        # Nenhum parâmetro fornecido
        with pytest.raises(ValidationError):
            GoogleLoginRequest()

        # Ambos code e id_token fornecidos
        with pytest.raises(ValidationError):
            GoogleLoginRequest(code="code123", id_token="idtoken123", state="state123")

    def test_require_state_when_using_code(self) -> None:
        with pytest.raises(ValidationError):
            GoogleLoginRequest(code="code123")

        # Válido com code e state
        req = GoogleLoginRequest(code="code123", state="state123")
        assert req.code == "code123"
        assert req.state == "state123"

    def test_valid_id_token_alone(self) -> None:
        req = GoogleLoginRequest(id_token="idtoken123")
        assert req.id_token == "idtoken123"
        assert req.code is None


class TestGoogleAuthService:
    """Valida o serviço GoogleAuthService com persistência e emissão de tokens."""

    async def test_login_disabled_raises_error(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", False)

        service = GoogleAuthService(db_session, provider=FakeGoogleIdentityProvider())
        req = GoogleLoginRequest(id_token="some-id-token")

        with pytest.raises(GoogleLoginDisabledError):
            await service.authenticate(data=req)

    async def test_login_creates_new_user_with_audit(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", True)

        provider = FakeGoogleIdentityProvider()
        service = GoogleAuthService(db_session, provider=provider)
        req = GoogleLoginRequest(id_token="valid-token")

        user, tokens = await service.authenticate(
            data=req,
            client_ip="192.168.1.50",
            user_agent="Mozilla/5.0 (X11; Linux x86_64)",
        )

        assert user.email == TEST_GOOGLE_EMAIL
        assert user.google_id == TEST_GOOGLE_SUB
        assert user.oauth_provider == "google"
        assert user.is_verified is True
        assert user.hashed_password is None
        assert user.role == UserRole.CLIENT_VIEWER

        assert tokens.access_token is not None
        assert tokens.refresh_token is not None
        assert tokens.token_type == "Bearer"

        # Verifica log de auditoria
        audit_stmt = select(AuditLogModel).where(AuditLogModel.actor_user_id == user.id)
        audit_log = await db_session.scalar(audit_stmt)
        assert audit_log is not None
        assert audit_log.action == "LOGIN_SUCCESS"
        assert audit_log.ip_address == "192.168.1.50"

    async def test_login_links_existing_user_by_email(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", True)

        # Usuário pré-existente cadastrado localmente
        user_repo = UserRepository(db_session)
        existing_user = await user_repo.create(
            email=TEST_GOOGLE_EMAIL,
            full_name="Local Pre-existing User",
            hashed_password="hashed_pass_local",
            role=UserRole.NOC_OPERATOR,
            is_active=True,
            is_verified=False,
        )
        await db_session.commit()

        provider = FakeGoogleIdentityProvider()
        service = GoogleAuthService(db_session, provider=provider)
        req = GoogleLoginRequest(id_token="valid-token")

        user, tokens = await service.authenticate(data=req)

        assert user.id == existing_user.id
        assert user.google_id == TEST_GOOGLE_SUB
        assert user.oauth_provider == "google"
        assert user.is_verified is True
        assert user.role == UserRole.NOC_OPERATOR
        assert user.hashed_password == "hashed_pass_local"
        assert tokens.access_token is not None

    async def test_login_with_code_and_state(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", True)

        state = create_google_state()
        provider = FakeGoogleIdentityProvider()
        service = GoogleAuthService(db_session, provider=provider)

        req = GoogleLoginRequest(code="auth-code-456", state=state)
        user, tokens = await service.authenticate(data=req)

        assert user.email == TEST_GOOGLE_EMAIL
        assert tokens.access_token is not None

    async def test_upstream_google_error_propagates(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", True)

        provider = FakeGoogleIdentityProvider()
        provider.verify_error = GoogleAuthError("Google certs unreachable")
        service = GoogleAuthService(db_session, provider=provider)

        req = GoogleLoginRequest(id_token="any-token")
        with pytest.raises(GoogleAuthError):
            await service.authenticate(data=req)


class TestGoogleAuthEndpoints:
    """Testes dos endpoints HTTP /api/v1/auth/google."""

    @pytest.fixture
    async def api_db(self) -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        yield session_factory
        await engine.dispose()

    async def test_get_url_disabled_returns_403(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", False)

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            resp = await client.get("/api/v1/auth/google/url")
            assert resp.status_code == 403
            assert resp.json()["error"]["code"] == "GOOGLE_LOGIN_DISABLED"

    async def test_get_url_enabled_returns_url_and_state(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", True)
        monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            resp = await client.get("/api/v1/auth/google/url")
            assert resp.status_code == 200
            data = resp.json()
            assert "authorization_url" in data
            assert "state" in data
            assert "test-client-id" in data["authorization_url"]

    async def test_callback_endpoint_success(
        self,
        api_db: async_sessionmaker[AsyncSession],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", True)

        # Mock do provedor de identidade no serviço
        from src.contexts.identity.services import google_auth_service

        fake_provider = FakeGoogleIdentityProvider()
        monkeypatch.setattr(google_auth_service, "get_default_google_provider", lambda: fake_provider)

        async def _override_get_db():
            async with api_db() as session:
                yield session

        app.dependency_overrides[get_db_session] = _override_get_db

        try:
            state = create_google_state()
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                payload = {"code": "mock-valid-code", "state": state}
                resp = await client.post("/api/v1/auth/google/callback", json=payload)
                assert resp.status_code == 200
                data = resp.json()
                assert "access_token" in data
                assert "refresh_token" in data
                assert data["token_type"] == "Bearer"
        finally:
            app.dependency_overrides.pop(get_db_session, None)
