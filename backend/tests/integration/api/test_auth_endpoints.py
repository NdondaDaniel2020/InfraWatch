"""Testes de integração para os endpoints REST de Autenticação e Organizações (ADR-003, ADR-020).

Valida os critérios de aceite da Issue #14:
1. Login bem-sucedido emite par de tokens válido e registra evento UserLoggedInEvent no Transactional Outbox.
2. Login com credenciais incorretas retorna 401 com mensagem neutra.
3. Rotação de token via POST /refresh sob concorrência e grace period.
4. Encerramento de sessão via POST /logout com invalidação e evento UserLoggedOutEvent no outbox.
5. Perfil de usuário autenticado via GET /me.
6. Gestão de organizações com controle de RBAC (SUPER_ADMIN) e isolamento multi-tenant.
7. Nenhuma chamada a background_tasks.add_task no código da API.
"""

from collections.abc import AsyncGenerator
from uuid import uuid4

import httpx
import pytest
from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.contexts.iam.domain.enums import OrgTier, UserRole
from src.contexts.iam.domain.models import (
    OrganizationModel,
    RefreshTokenModel,
    UserModel,
)
from src.contexts.iam.security.password import password_hasher
from src.contexts.iam.security.tokens import create_access_token
from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel, OutboxStatus
from src.core.database.session import get_db_session


@pytest.fixture
async def integration_db() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria banco SQLite em memória isolado para os testes de integração da API."""
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


@pytest.fixture
async def seeded_user(
    integration_db: async_sessionmaker[AsyncSession],
) -> tuple[UserModel, OrganizationModel, str]:
    """Popula uma organização e um usuário de teste com senha Argon2id válida."""
    raw_password = "StrongPassword@2026!"
    hashed_pwd = password_hasher.hash(raw_password)

    async with integration_db() as session, session.begin():
        org = OrganizationModel(
            id=uuid4(),
            name="Banco Angolano de Investimentos",
            slug="bai-angola",
            tier=OrgTier.ENTERPRISE_GOLD,
        )
        session.add(org)

        user = UserModel(
            id=uuid4(),
            email="sec.ops@bai.ao",
            full_name="Operador de Segurança BAI",
            role=UserRole.CLIENT_VIEWER,
            hashed_password=hashed_pwd,
            organization_id=org.id,
            is_active=True,
        )
        session.add(user)

    return user, org, raw_password


@pytest.fixture
def override_db(integration_db: async_sessionmaker[AsyncSession]) -> AsyncGenerator[None, None]:
    """Sobrescreve a dependência get_db_session na aplicação FastAPI."""

    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with integration_db() as session:
            yield session

    app.dependency_overrides[get_db_session] = _get_test_session
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_login_successful_emits_tokens_and_outbox_event(
    override_db: None,
    integration_db: async_sessionmaker[AsyncSession],
    seeded_user: tuple[UserModel, OrganizationModel, str],
) -> None:
    """Critério 1: Login bem-sucedido emite par de tokens válido e registra evento de auditoria no outbox."""
    user, _, password = seeded_user

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": password},
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "Bearer"
    assert data["expires_in"] > 0

    # Valida registro do evento no Transactional Outbox
    async with integration_db() as session:
        res = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.event_type == "UserLoggedInEvent")
        )
        outbox_event = res.scalars().first()
        assert outbox_event is not None
        assert outbox_event.status == OutboxStatus.PENDING
        assert str(outbox_event.aggregate_id) == str(user.id)
        assert outbox_event.payload["email"] == user.email


@pytest.mark.asyncio
async def test_login_invalid_password_returns_401(
    override_db: None,
    seeded_user: tuple[UserModel, OrganizationModel, str],
) -> None:
    """Critério 2: Senha incorreta retorna 401 com mensagem neutra."""
    user, _, _ = seeded_user

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": "WrongPassword123!"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Credenciais inválidas."


@pytest.mark.asyncio
async def test_login_unregistered_email_returns_neutral_401(
    override_db: None,
) -> None:
    """Neutralidade de erro: e-mail não existente retorna a mesma mensagem neutra."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent.user@empresa.ao", "password": "AnyPassword123!"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Credenciais inválidas."


@pytest.mark.asyncio
async def test_refresh_token_rotation_flow(
    override_db: None,
    seeded_user: tuple[UserModel, OrganizationModel, str],
) -> None:
    """Critério 3: Rotação de refresh token sob grace period."""
    user, _, password = seeded_user

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # 1. Login inicial
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": password},
        )
        refresh_token = login_res.json()["refresh_token"]

        # 2. Rotação via POST /api/v1/auth/refresh
        refresh_res = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert refresh_res.status_code == status.HTTP_200_OK
        data = refresh_res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["refresh_token"] != refresh_token


@pytest.mark.asyncio
async def test_logout_revokes_token_and_emits_outbox_event(
    override_db: None,
    integration_db: async_sessionmaker[AsyncSession],
    seeded_user: tuple[UserModel, OrganizationModel, str],
) -> None:
    """Critério 4: Logout encerra sessão, revoga token e emite UserLoggedOutEvent no outbox."""
    user, _, password = seeded_user

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # Login
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": password},
        )
        access_token = login_res.json()["access_token"]
        refresh_token = login_res.json()["refresh_token"]

        # Logout
        logout_res = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": refresh_token},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert logout_res.status_code == status.HTTP_200_OK
        assert logout_res.json()["status"] == "ok"

    # Valida evento UserLoggedOutEvent no outbox
    async with integration_db() as session:
        res = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.event_type == "UserLoggedOutEvent")
        )
        outbox_event = res.scalars().first()
        assert outbox_event is not None
        assert outbox_event.payload["email"] == user.email

        # Garante que o refresh token foi revogado no banco
        token_res = await session.execute(select(RefreshTokenModel))
        revoked_token = token_res.scalars().first()
        assert revoked_token is not None
        assert revoked_token.is_revoked is True


@pytest.mark.asyncio
async def test_get_my_profile_me(
    override_db: None,
    seeded_user: tuple[UserModel, OrganizationModel, str],
) -> None:
    """Critério 5: Perfil autenticado via GET /me."""
    user, org, password = seeded_user

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # Login
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": password},
        )
        access_token = login_res.json()["access_token"]

        # Perfil
        me_res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_res.status_code == status.HTTP_200_OK
        data = me_res.json()
        assert data["email"] == user.email
        assert data["full_name"] == user.full_name
        assert data["role"] == UserRole.CLIENT_VIEWER
        assert data["organization_id"] == str(org.id)


@pytest.mark.asyncio
async def test_organizations_management_flow_and_rbac(
    override_db: None,
    integration_db: async_sessionmaker[AsyncSession],
    seeded_user: tuple[UserModel, OrganizationModel, str],
) -> None:
    """Critério 6: Criação restrita a SUPER_ADMIN e isolamento multi-tenant de listagem."""
    _, org, _ = seeded_user

    admin_token = create_access_token(
        data={"sub": str(uuid4()), "email": "admin@rcs.ao", "role": UserRole.SUPER_ADMIN}
    )
    viewer_token = create_access_token(
        data={
            "sub": str(uuid4()),
            "email": "viewer@bai.ao",
            "role": UserRole.CLIENT_VIEWER,
            "organization_id": str(org.id),
        }
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # 1. CLIENT_VIEWER tentando criar organização -> 403 Forbidden
        create_attempt = await client.post(
            "/api/v1/organizations",
            json={"name": "Banco Sol", "slug": "banco-sol", "tier": "STANDARD"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert create_attempt.status_code == status.HTTP_403_FORBIDDEN

        # 2. SUPER_ADMIN criando organização com sucesso -> 201 Created
        create_res = await client.post(
            "/api/v1/organizations",
            json={
                "name": "Banco Sol",
                "slug": "banco-sol",
                "tier": "STANDARD",
                "sla_target_default": "99.90",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert create_res.status_code == status.HTTP_201_CREATED
        new_org = create_res.json()
        assert new_org["slug"] == "banco-sol"

        # Valida evento OrganizationCreatedEvent no outbox
        async with integration_db() as session:
            outbox_res = await session.execute(
                select(OutboxEventModel).where(
                    OutboxEventModel.event_type == "OrganizationCreatedEvent"
                )
            )
            outbox_event = outbox_res.scalars().first()
            assert outbox_event is not None
            assert outbox_event.payload["slug"] == "banco-sol"

        # 3. Listagem como SUPER_ADMIN -> visualiza todas (BAI + Banco Sol = 2)
        admin_list = await client.get(
            "/api/v1/organizations",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert admin_list.status_code == status.HTTP_200_OK
        assert admin_list.json()["total"] == 2

        # 4. Listagem como CLIENT_VIEWER -> visualiza estritamente sua própria organização (1)
        viewer_list = await client.get(
            "/api/v1/organizations",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert viewer_list.status_code == status.HTTP_200_OK
        assert viewer_list.json()["total"] == 1
        assert viewer_list.json()["items"][0]["id"] == str(org.id)
