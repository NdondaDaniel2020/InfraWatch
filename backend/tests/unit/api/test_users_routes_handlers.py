"""Testes unitários diretos para os route handlers de Usuários e Sessões (IAM)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.contexts.iam.api.routes.users import (
    activate_user,
    admin_disable_mfa,
    create_user,
    deactivate_user,
    get_my_user_profile,
    get_user_by_id,
    list_my_sessions,
    list_users,
    revoke_all_sessions,
    revoke_session_by_id,
    update_my_user_profile,
    update_user_role,
)
from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.user import (
    AdminUserCreate,
    UserRolesUpdate,
    UserUpdate,
)
from src.core.exceptions import EmailAlreadyExistsError, NotFoundError
from src.core.web.pagination import PaginationParams


@pytest.fixture
def current_user():
    return AuthenticatedUser(
        id=str(uuid4()),
        email="operator@corp.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=str(uuid4()),
    )


@pytest.fixture
def org_admin_user():
    org_id = str(uuid4())
    return AuthenticatedUser(
        id=str(uuid4()),
        email="orgadmin@corp.ao",
        role=UserRole.ORG_ADMIN.value,
        organization_id=org_id,
    )


@pytest.mark.asyncio
async def test_get_and_update_my_profile(current_user) -> None:
    """Valida consulta e atualização do perfil próprio."""
    mock_query = AsyncMock()
    mock_command = AsyncMock()

    mock_user_entity = MagicMock()
    mock_user_entity.id = uuid4()
    mock_user_entity.email = "operator@corp.ao"
    mock_user_entity.full_name = "Operador NOC"
    mock_user_entity.role = UserRole.SUPER_ADMIN.value
    mock_user_entity.organization_id = None
    mock_user_entity.organization_name = None
    mock_user_entity.is_active = True
    mock_user_entity.is_verified = True
    mock_user_entity.mfa_enabled = False
    mock_user_entity.mfa_type = None
    mock_user_entity.created_at = datetime.now(UTC)
    mock_user_entity.updated_at = datetime.now(UTC)

    # 1. get_my_user_profile sucesso
    mock_query.get_user_by_id.return_value = mock_user_entity
    res = await get_my_user_profile(current_user=current_user, query_service=mock_query)
    assert res.email == "operator@corp.ao"

    # 2. get_my_user_profile usuário não encontrado
    mock_query.get_user_by_id.side_effect = NotFoundError("User not found")
    with pytest.raises(HTTPException) as exc:
        await get_my_user_profile(current_user=current_user, query_service=mock_query)
    assert exc.value.status_code == 404

    # 3. update_my_user_profile sucesso
    mock_user_entity.full_name = "Novo Nome Operador"
    mock_command.update_profile.return_value = mock_user_entity
    body = UserUpdate(full_name="Novo Nome Operador")
    res_up = await update_my_user_profile(
        body=body, current_user=current_user, command_service=mock_command
    )
    assert res_up.full_name == "Novo Nome Operador"


@pytest.mark.asyncio
async def test_sessions_handlers(current_user) -> None:
    """Valida listagem e revogação de sessões ativas."""
    mock_session_service = AsyncMock()
    mock_token = MagicMock()
    mock_token.id = uuid4()
    mock_token.device_name = "Chrome Linux"
    mock_token.ip_address = "10.0.0.1"
    mock_token.created_at = datetime.now(UTC)
    mock_token.expires_at = datetime.now(UTC)
    mock_token.token_hash = "hash123"

    mock_session_service.list_active_sessions.return_value = [mock_token]

    # 1. list_my_sessions
    list_res = await list_my_sessions(
        current_user=current_user, session_service=mock_session_service, x_refresh_token=None
    )
    assert list_res.total == 1
    assert list_res.sessions[0].device_name == "Chrome Linux"

    # 2. revoke_session_by_id sucesso
    mock_session_service.revoke_session.return_value = True
    rev = await revoke_session_by_id(
        session_id=uuid4(), current_user=current_user, session_service=mock_session_service
    )
    assert rev.revoked_count == 1

    # 3. revoke_session_by_id falha (404)
    mock_session_service.revoke_session.return_value = False
    with pytest.raises(HTTPException) as exc:
        await revoke_session_by_id(
            session_id=uuid4(), current_user=current_user, session_service=mock_session_service
        )
    assert exc.value.status_code == 404

    # 4. revoke_all_sessions
    mock_session_service.revoke_all_sessions.return_value = 3
    rev_all = await revoke_all_sessions(
        current_user=current_user, session_service=mock_session_service, x_refresh_token=None
    )
    assert rev_all.revoked_count == 3


@pytest.mark.asyncio
async def test_admin_user_management(current_user, org_admin_user) -> None:
    """Valida listagem administrativa, criação e transições de ativação/desativação."""
    mock_query = AsyncMock()
    mock_command = AsyncMock()

    mock_user_entity = MagicMock()
    mock_user_entity.id = uuid4()
    mock_user_entity.email = "dev@corp.ao"
    mock_user_entity.full_name = "Dev Team"
    mock_user_entity.role = UserRole.CLIENT_VIEWER.value
    mock_user_entity.organization_id = UUID(org_admin_user.organization_id)
    mock_user_entity.organization_name = "ACME Corp"
    mock_user_entity.is_active = True
    mock_user_entity.is_verified = True
    mock_user_entity.mfa_enabled = False
    mock_user_entity.mfa_type = None
    mock_user_entity.created_at = datetime.now(UTC)
    mock_user_entity.updated_at = datetime.now(UTC)

    # 1. list_users como super admin
    mock_query.list_users.return_value = ([mock_user_entity], 1)
    pagination = PaginationParams(page=1, page_size=10)
    users_res = await list_users(
        current_user=current_user, pagination=pagination, query_service=mock_query
    )
    assert users_res.total == 1

    # 2. list_users isolamento de tenant para ORG_ADMIN com org_id divergente
    with pytest.raises(HTTPException) as exc:
        await list_users(
            current_user=org_admin_user,
            pagination=pagination,
            query_service=mock_query,
            organization_id=uuid4(),
        )
    assert exc.value.status_code == 403

    # 3. create_user com conflito de e-mail existente
    mock_command.create_user_admin.side_effect = EmailAlreadyExistsError("Email exists")
    body = AdminUserCreate(
        email="dev@corp.ao",
        password="ValidPassword123!",
        full_name="Dev Team",
        role=UserRole.CLIENT_VIEWER,
        organization_id=UUID(org_admin_user.organization_id),
    )
    with pytest.raises(HTTPException) as exc_conflict:
        await create_user(body=body, current_user=current_user, command_service=mock_command)
    assert exc_conflict.value.status_code == 409

    # 4. update_user_role
    mock_command.update_user_role.return_value = mock_user_entity
    roles_up = UserRolesUpdate(role=UserRole.CLIENT_VIEWER)
    res_role = await update_user_role(
        user_id=mock_user_entity.id, body=roles_up, command_service=mock_command
    )
    assert res_role.email == "dev@corp.ao"

    # 5. deactivate_user - não pode desativar a si mesmo e sucesso para outro usuário
    with pytest.raises(HTTPException) as exc_self:
        await deactivate_user(
            user_id=UUID(current_user.id),
            current_user=current_user,
            query_service=mock_query,
            command_service=mock_command,
        )
    assert exc_self.value.status_code == 400

    other_id = uuid4()
    mock_query.get_user_by_id.return_value = mock_user_entity
    mock_command.deactivate_user.return_value = mock_user_entity
    deact_res = await deactivate_user(
        user_id=other_id,
        current_user=current_user,
        query_service=mock_query,
        command_service=mock_command,
    )
    assert deact_res.id == mock_user_entity.id

    # 6. activate_user sucesso e 403 para org_admin em outra org
    mock_command.activate_user.return_value = mock_user_entity
    act_res = await activate_user(
        user_id=other_id,
        current_user=current_user,
        query_service=mock_query,
        command_service=mock_command,
    )
    assert act_res.id == mock_user_entity.id

    other_org_user = MagicMock(organization_id=uuid4())
    mock_query.get_user_by_id.return_value = other_org_user
    with pytest.raises(HTTPException) as exc_act_403:
        await activate_user(
            user_id=other_id,
            current_user=org_admin_user,
            query_service=mock_query,
            command_service=mock_command,
        )
    assert exc_act_403.value.status_code == 403

    # 7. get_user_by_id sucesso e 403
    mock_query.get_user_by_id.return_value = mock_user_entity
    user_by_id_res = await get_user_by_id(
        user_id=mock_user_entity.id,
        current_user=current_user,
        query_service=mock_query,
    )
    assert user_by_id_res.id == mock_user_entity.id

    with pytest.raises(HTTPException) as exc_get_403:
        mock_query.get_user_by_id.return_value = other_org_user
        await get_user_by_id(
            user_id=other_id,
            current_user=org_admin_user,
            query_service=mock_query,
        )
    assert exc_get_403.value.status_code == 403

    # 8. admin_disable_mfa
    mock_command.admin_disable_mfa.return_value = mock_user_entity
    mfa_res = await admin_disable_mfa(user_id=mock_user_entity.id, command_service=mock_command)
    assert mfa_res.email == "dev@corp.ao"
