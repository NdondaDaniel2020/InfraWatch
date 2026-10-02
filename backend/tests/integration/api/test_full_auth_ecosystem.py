"""Testes de integração para o ecossistema completo de Autenticação e Gestão de Usuários (Issue #53).

Cobre:
1. Registro de usuário com validação de senha e fluxo de verificação de e-mail.
2. Login com formulário OAuth2 (/login-form) para Swagger UI /docs.
3. Fluxo de recuperação e redefinição de senha com token seguro SHA-256.
4. Ciclo completo de MFA/TOTP (setup, enable, challenge de login, backup code burn-on-use e disable).
5. Gestão de sessões ativas (listagem, revogação unitária e revogação geral).
6. Administração de usuários (listagem, ativação/desativação e admin disable MFA).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import uuid4

import httpx
import pyotp
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
    EmailVerificationTokenModel,
    OrganizationModel,
    PasswordResetTokenModel,
    UserModel,
)
from src.contexts.iam.security.password import password_hasher
from src.contexts.iam.security.tokens import create_access_token, hash_opaque_token
from src.core.database.base_model import Base
from src.core.database.session import get_db_session


@pytest.fixture
async def integration_db() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Cria banco SQLite em memória isolado para os testes de integração."""
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
def override_db(integration_db: async_sessionmaker[AsyncSession]) -> AsyncGenerator[None, None]:
    """Sobrescreve a dependência get_db_session na aplicação FastAPI."""

    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with integration_db() as session:
            yield session

    app.dependency_overrides[get_db_session] = _get_test_session
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def setup_org_and_users(
    integration_db: async_sessionmaker[AsyncSession],
) -> tuple[OrganizationModel, UserModel, UserModel, str]:
    """Cria organização, usuário comum e superadmin."""
    raw_password = "SecurePassword@2026!"
    hashed_pwd = password_hasher.hash(raw_password)

    async with integration_db() as session, session.begin():
        org = OrganizationModel(
            id=uuid4(),
            name="Angola Telecom Observability",
            slug="angola-telecom",
            tier=OrgTier.ENTERPRISE_GOLD,
        )
        session.add(org)

        admin_user = UserModel(
            id=uuid4(),
            email="admin@infrawatch.ao",
            full_name="Super Admin RCS",
            role=UserRole.SUPER_ADMIN,
            hashed_password=hashed_pwd,
            organization_id=org.id,
            is_active=True,
            is_verified=True,
        )
        session.add(admin_user)

        normal_user = UserModel(
            id=uuid4(),
            email="tech.noc@angolatelecom.ao",
            full_name="Técnico NOC Angola Telecom",
            role=UserRole.CLIENT_VIEWER,
            hashed_password=hashed_pwd,
            organization_id=org.id,
            is_active=True,
            is_verified=False,
        )
        session.add(normal_user)

    return org, normal_user, admin_user, raw_password


@pytest.mark.asyncio
async def test_user_registration_and_email_verification_lifecycle(
    override_db: None,
    integration_db: async_sessionmaker[AsyncSession],
    setup_org_and_users: tuple[OrganizationModel, UserModel, UserModel, str],
) -> None:
    """Valida o registro de novo usuário e confirmação de e-mail através do token."""
    org, _, _, _ = setup_org_and_users

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # 1. Registro com sucesso
        reg_response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "new.analyst@angolatelecom.ao",
                "password": "CompliantPassword#2026",
                "full_name": "Novo Analista NOC",
                "organization_id": str(org.id),
                "role": "CLIENT_VIEWER",
            },
        )
        assert reg_response.status_code == status.HTTP_201_CREATED
        user_data = reg_response.json()
        assert user_data["email"] == "new.analyst@angolatelecom.ao"
        assert not user_data["is_verified"]

        # 2. Conflito ao tentar registrar o mesmo e-mail
        dup_response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "new.analyst@angolatelecom.ao",
                "password": "CompliantPassword#2026",
                "full_name": "Duplicado",
            },
        )
        assert dup_response.status_code == status.HTTP_409_CONFLICT

        # 3. Busca o token gerado no banco de dados para simular o clique do e-mail
        async with integration_db() as session:
            stmt = select(EmailVerificationTokenModel)
            res = await session.execute(stmt)
            token_record = res.scalars().first()
            assert token_record is not None

            # Para teste de verificação, inserimos um token com hash conhecido
            test_raw_token = "raw_email_verification_secret_token_123"
            token_record.token_hash = hash_opaque_token(test_raw_token)
            await session.commit()

        # 4. Confirmação do e-mail
        verify_response = await client.post(
            "/api/v1/auth/verify-email",
            json={"token": test_raw_token},
        )
        assert verify_response.status_code == status.HTTP_200_OK

        # 5. Validação no banco de que agora está verificado
        async with integration_db() as session:
            stmt = select(UserModel).where(UserModel.email == "new.analyst@angolatelecom.ao")
            res = await session.execute(stmt)
            updated_user = res.scalars().first()
            assert updated_user is not None
            assert updated_user.is_verified is True


@pytest.mark.asyncio
async def test_oauth2_login_form_compatibility(
    override_db: None,
    setup_org_and_users: tuple[OrganizationModel, UserModel, UserModel, str],
) -> None:
    """Valida autenticação compatível com formulário OAuth2 (POST /api/v1/auth/login-form)."""
    _, normal_user, _, password = setup_org_and_users

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/auth/login-form",
            data={
                "username": normal_user.email,
                "password": password,
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "Bearer"


@pytest.mark.asyncio
async def test_password_reset_flow(
    override_db: None,
    integration_db: async_sessionmaker[AsyncSession],
    setup_org_and_users: tuple[OrganizationModel, UserModel, UserModel, str],
) -> None:
    """Valida o fluxo completo de solicitação e confirmação de redefinição de senha."""
    _, normal_user, _, _ = setup_org_and_users

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # 1. Solicitação de redefinição
        req_resp = await client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": normal_user.email},
        )
        assert req_resp.status_code == status.HTTP_200_OK

        # 2. Configura token no banco para teste
        test_raw_reset = "raw_reset_token_secret_456"
        async with integration_db() as session:
            stmt = select(PasswordResetTokenModel).where(
                PasswordResetTokenModel.user_id == normal_user.id
            )
            res = await session.execute(stmt)
            reset_record = res.scalars().first()
            assert reset_record is not None
            reset_record.token_hash = hash_opaque_token(test_raw_reset)
            await session.commit()

        # 3. Confirmação de reset com nova senha
        new_password = "BrandNewSecurePassword@2026"
        confirm_resp = await client.post(
            "/api/v1/auth/password-reset/confirm",
            json={
                "token": test_raw_reset,
                "new_password": new_password,
            },
        )
        assert confirm_resp.status_code == status.HTTP_200_OK

        # 4. Login com nova senha deve suceder
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": normal_user.email, "password": new_password},
        )
        assert login_resp.status_code == status.HTTP_200_OK
        assert "access_token" in login_resp.json()


@pytest.mark.asyncio
async def test_mfa_totp_and_challenge_login_flow(
    override_db: None,
    setup_org_and_users: tuple[OrganizationModel, UserModel, UserModel, str],
) -> None:
    """Valida ciclo de MFA: Setup -> Enable -> Login Challenge com TOTP e com Backup Code -> Disable."""
    _, normal_user, _, password = setup_org_and_users

    # Cria access token do usuário para configurar MFA
    user_token = create_access_token(
        data={
            "sub": str(normal_user.id),
            "email": normal_user.email,
            "role": normal_user.role.value,
            "organization_id": str(normal_user.organization_id),
        }
    )
    auth_headers = {"Authorization": f"Bearer {user_token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # 1. Setup TOTP
        setup_resp = await client.post("/api/v1/mfa/setup", headers=auth_headers)
        assert setup_resp.status_code == status.HTTP_200_OK
        setup_data = setup_resp.json()
        secret = setup_data["secret"]
        assert "otpauth://" in setup_data["otpauth_uri"]

        # 2. Ativação com código TOTP válido
        totp = pyotp.TOTP(secret)
        valid_code = totp.now()
        enable_resp = await client.post(
            "/api/v1/mfa/enable",
            headers=auth_headers,
            json={"code": valid_code},
        )
        assert enable_resp.status_code == status.HTTP_200_OK
        enable_data = enable_resp.json()
        backup_codes = enable_data["backup_codes"]
        assert len(backup_codes) == 10

        # 3. Tenta login normal: deve exigir MFA (mfa_required=True)
        login_mfa_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": normal_user.email, "password": password},
        )
        assert login_mfa_resp.status_code == status.HTTP_200_OK
        challenge_info = login_mfa_resp.json()
        assert challenge_info["mfa_required"] is True
        assert challenge_info["mfa_pending_token"] is not None
        pending_token = challenge_info["mfa_pending_token"]

        # 4. Resolve desafio via TOTP code
        challenge_resp = await client.post(
            "/api/v1/auth/login/mfa-challenge",
            json={
                "mfa_pending_token": pending_token,
                "code": totp.now(),
            },
        )
        assert challenge_resp.status_code == status.HTTP_200_OK
        assert "access_token" in challenge_resp.json()

        # 5. Novo login usando Backup Code
        login_backup_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": normal_user.email, "password": password},
        )
        second_pending = login_backup_resp.json()["mfa_pending_token"]

        used_backup_code = backup_codes[0]
        backup_challenge_resp = await client.post(
            "/api/v1/auth/login/mfa-challenge",
            json={
                "mfa_pending_token": second_pending,
                "code": used_backup_code,
            },
        )
        assert backup_challenge_resp.status_code == status.HTTP_200_OK

        # 6. Reutilizar o mesmo backup code deve falhar (Burn-on-Use)
        login_fail_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": normal_user.email, "password": password},
        )
        third_pending = login_fail_resp.json()["mfa_pending_token"]
        fail_challenge = await client.post(
            "/api/v1/auth/login/mfa-challenge",
            json={
                "mfa_pending_token": third_pending,
                "code": used_backup_code,
            },
        )
        assert fail_challenge.status_code == status.HTTP_401_UNAUTHORIZED

        # 7. Desativação do MFA
        disable_resp = await client.post(
            "/api/v1/mfa/disable",
            headers=auth_headers,
            json={"password": password, "code": totp.now()},
        )
        assert disable_resp.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_session_management_endpoints(
    override_db: None,
    setup_org_and_users: tuple[OrganizationModel, UserModel, UserModel, str],
) -> None:
    """Valida listagem de sessões ativas e encerramento remoto."""
    _, normal_user, _, password = setup_org_and_users

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # Cria sessão fazendo login
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": normal_user.email, "password": password},
        )
        tokens = login_resp.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        # Lista sessões
        sessions_resp = await client.get("/api/v1/users/me/sessions", headers=headers)
        assert sessions_resp.status_code == status.HTTP_200_OK
        sessions_data = sessions_resp.json()
        assert sessions_data["total"] >= 1
        session_id = sessions_data["sessions"][0]["id"]

        # Revoga a sessão específica
        del_resp = await client.delete(
            f"/api/v1/users/me/sessions/{session_id}",
            headers=headers,
        )
        assert del_resp.status_code == status.HTTP_200_OK

        # Revoga todas
        all_del_resp = await client.delete("/api/v1/users/me/sessions", headers=headers)
        assert all_del_resp.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_admin_user_management(
    override_db: None,
    setup_org_and_users: tuple[OrganizationModel, UserModel, UserModel, str],
) -> None:
    """Valida operações de administração: listagem, ativação, desativação e reset emergencial de MFA."""
    _, normal_user, admin_user, _ = setup_org_and_users

    admin_token = create_access_token(
        data={
            "sub": str(admin_user.id),
            "email": admin_user.email,
            "role": admin_user.role.value,
            "organization_id": str(admin_user.organization_id),
        }
    )
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # 1. Admin lista usuários
        list_resp = await client.get("/api/v1/users", headers=admin_headers)
        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.json()["total"] >= 2

        # 2. Admin consulta usuário específico
        get_resp = await client.get(f"/api/v1/users/{normal_user.id}", headers=admin_headers)
        assert get_resp.status_code == status.HTTP_200_OK
        assert get_resp.json()["email"] == normal_user.email

        # 3. Admin desativa usuário
        deact_resp = await client.post(
            f"/api/v1/users/{normal_user.id}/deactivate",
            headers=admin_headers,
        )
        assert deact_resp.status_code == status.HTTP_200_OK
        assert not deact_resp.json()["is_active"]

        # 4. Admin reativa usuário
        act_resp = await client.post(
            f"/api/v1/users/{normal_user.id}/activate",
            headers=admin_headers,
        )
        assert act_resp.status_code == status.HTTP_200_OK
        assert act_resp.json()["is_active"] is True

        # 5. Admin desativa MFA emergencialmente
        mfa_del_resp = await client.delete(
            f"/api/v1/users/{normal_user.id}/mfa",
            headers=admin_headers,
        )
        assert mfa_del_resp.status_code == status.HTTP_200_OK
        assert mfa_del_resp.json()["mfa_enabled"] is False
