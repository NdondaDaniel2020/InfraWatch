"""Testes unitários para o UserCommandService (IAM / CQRS)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.domain.aggregate import User
from src.contexts.iam.domain.commands import (
    ActivateUserCommand,
    AdminDisableMfaCommand,
    ChangeUserRoleCommand,
    DeactivateUserCommand,
    RegisterUserCommand,
    UpdateProfileCommand,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.services.user_command_service import UserCommandService
from src.core.database.unit_of_work import AbstractUnitOfWork
from src.core.exceptions import EmailAlreadyExistsError, NotFoundError

VALID_HASH = "$2b$12$valid_hash_with_sufficient_length_for_domain_vo"


@pytest.fixture
def mock_uow_and_session():
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock()

    mock_uow = MagicMock(spec=AbstractUnitOfWork)
    mock_uow.session = mock_session
    mock_uow.commit = AsyncMock()
    return mock_uow, mock_session


@pytest.mark.asyncio
async def test_init_validation() -> None:
    """Garante erro ao inicializar sem session ou uow."""
    with pytest.raises(ValueError, match="uow_or_session or session is required"):
        UserCommandService(None)


@pytest.mark.asyncio
async def test_register_user_success(mock_uow_and_session) -> None:
    """Valida cadastro de usuário, persistência, token de verificação e evento outbox."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    mock_user_repo.get_by_email.return_value = None

    saved_model = UserModel(
        id=uuid4(),
        email="novo@corp.ao",
        hashed_password=VALID_HASH,
        full_name="Novo Usuario",
        role=UserRole.CLIENT_VIEWER.value,
        is_active=True,
    )
    mock_user_repo.save.return_value = saved_model

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)
    service.email_token_repo = AsyncMock()

    with patch(
        "src.contexts.iam.services.user_command_service.OutboxRepository.add_event"
    ) as mock_outbox:
        user, token = await service.register_user(
            RegisterUserCommand(
                email="novo@corp.ao",
                password="Password@123",
                full_name="Novo Usuario",
                role=UserRole.CLIENT_VIEWER,
            )
        )

        assert user.email == "novo@corp.ao"
        assert len(token) > 20
        mock_user_repo.save.assert_called_once()
        service.email_token_repo.create.assert_called_once()
        mock_outbox.assert_called_once()
        mock_uow.commit.assert_called_once()


@pytest.mark.asyncio
async def test_register_user_email_already_exists(mock_uow_and_session) -> None:
    """Garante erro de e-mail duplicado no cadastro."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    mock_user_repo.get_by_email.return_value = UserModel(id=uuid4(), email="duplicado@corp.ao")

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)

    with pytest.raises(EmailAlreadyExistsError):
        await service.register_user(
            email="duplicado@corp.ao",
            password="Password@123",
            full_name="Duplicado",
        )


@pytest.mark.asyncio
async def test_create_user_admin_success(mock_uow_and_session) -> None:
    """Valida criação e ativação direta de usuário administrativo com organização."""
    mock_uow, mock_session = mock_uow_and_session
    mock_user_repo = AsyncMock()
    mock_user_repo.get_by_email.return_value = None

    org_id = uuid4()
    saved_model = UserModel(
        id=uuid4(),
        email="admin_user@corp.ao",
        hashed_password=VALID_HASH,
        full_name="Admin Operador",
        role=UserRole.ORG_ADMIN.value,
        organization_id=org_id,
        is_active=True,
        is_verified=True,
    )
    mock_user_repo.save.return_value = saved_model

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)

    created = await service.create_user_admin(
        email="admin_user@corp.ao",
        password="Password@123",
        full_name="Admin Operador",
        role=UserRole.ORG_ADMIN,
        organization_id=org_id,
    )

    assert created.email == "admin_user@corp.ao"
    mock_session.refresh.assert_called()
    mock_uow.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_profile(mock_uow_and_session) -> None:
    """Valida atualização de nome completo no perfil e publicação de evento."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()

    user_model = UserModel(
        id=user_id,
        email="user@corp.ao",
        full_name="Nome Antigo",
        role=UserRole.NOC_OPERATOR.value,
        is_active=True,
    )
    mock_user_repo.get_by_id.return_value = user_model

    aggregate = User(
        id=user_id,
        email="user@corp.ao",
        hashed_password=VALID_HASH,
        full_name="Nome Antigo",
        role=UserRole.NOC_OPERATOR,
        is_active=True,
    )
    mock_user_repo._to_domain = MagicMock(return_value=aggregate)

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)

    # 1. Usuário não encontrado
    mock_user_repo.get_by_id.return_value = None
    with pytest.raises(NotFoundError):
        await service.update_profile(user_id, full_name="Novo Nome")

    # 2. Sucesso com alteração de nome
    mock_user_repo.get_by_id.return_value = user_model
    with patch(
        "src.contexts.iam.services.user_command_service.OutboxRepository.add_event"
    ) as mock_outbox:
        updated = await service.update_profile(
            user_id, cmd=UpdateProfileCommand(user_id=user_id, full_name="Nome Novo")
        )
        assert updated.full_name == "Nome Novo"
        mock_outbox.assert_called_once()
        mock_uow.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_roles(mock_uow_and_session) -> None:
    """Valida mudança de papel RBAC do usuário."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()

    user_model = UserModel(
        id=user_id,
        email="user@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
        is_active=True,
    )
    mock_user_repo.get_by_id.return_value = user_model

    aggregate = User(
        id=user_id,
        email="user@corp.ao",
        hashed_password=VALID_HASH,
        full_name="User Test",
        role=UserRole.CLIENT_VIEWER,
        is_active=True,
    )
    mock_user_repo._to_domain = MagicMock(return_value=aggregate)

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)

    # Erro de role None
    with pytest.raises(ValueError, match="papel de usuário"):
        await service.update_roles(user_id, role=None)

    # Sucesso
    with patch(
        "src.contexts.iam.services.user_command_service.OutboxRepository.add_event"
    ) as mock_outbox:
        updated = await service.update_roles(
            user_id, cmd=ChangeUserRoleCommand(user_id=user_id, role=UserRole.ORG_ADMIN)
        )
        assert updated.role == UserRole.ORG_ADMIN.value
        mock_outbox.assert_called_once()


@pytest.mark.asyncio
async def test_activate_and_deactivate_user(mock_uow_and_session) -> None:
    """Valida ativação e desativação (suspensão) de usuário com revogação de sessões."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()

    user_model = UserModel(
        id=user_id,
        email="user@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
        is_active=True,
    )
    mock_user_repo.get_by_id.return_value = user_model

    aggregate = User(
        id=user_id,
        email="user@corp.ao",
        hashed_password=VALID_HASH,
        full_name="User NOC",
        role=UserRole.NOC_OPERATOR,
        is_active=True,
    )
    mock_user_repo._to_domain = MagicMock(return_value=aggregate)

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)
    service.refresh_token_repo = AsyncMock()

    # Desativação
    with patch(
        "src.contexts.iam.services.user_command_service.OutboxRepository.add_event"
    ) as mock_outbox:
        deact = await service.deactivate_user(
            user_id, cmd=DeactivateUserCommand(user_id=user_id, reason="Segurança")
        )
        assert not deact.is_active
        service.refresh_token_repo.revoke_other_sessions.assert_called_with(user_id)
        mock_outbox.assert_called_once()

    # Ativação
    aggregate_inactive = User(
        id=user_id,
        email="user@corp.ao",
        hashed_password=VALID_HASH,
        full_name="User NOC",
        role=UserRole.NOC_OPERATOR,
        is_active=False,
    )
    mock_user_repo._to_domain = MagicMock(return_value=aggregate_inactive)
    act = await service.activate_user(user_id, ActivateUserCommand(user_id=user_id))
    assert act.is_active


@pytest.mark.asyncio
async def test_admin_disable_mfa(mock_uow_and_session) -> None:
    """Valida desativação administrativa de emergência de MFA."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()

    user_model = UserModel(
        id=user_id,
        email="user@corp.ao",
        mfa_enabled=True,
        mfa_type="totp",
        is_active=True,
    )
    mock_user_repo.get_by_id.return_value = user_model

    aggregate = User(
        id=user_id,
        email="user@corp.ao",
        hashed_password=VALID_HASH,
        full_name="User NOC",
        role=UserRole.NOC_OPERATOR,
        mfa_enabled=True,
        mfa_type="totp",
        is_active=True,
    )
    mock_user_repo._to_domain = MagicMock(return_value=aggregate)

    service = UserCommandService(uow_or_session=mock_uow, user_repository=mock_user_repo)
    service.mfa_repo = AsyncMock()
    mock_method = MagicMock()
    service.mfa_repo.get_active_by_user_and_type.return_value = mock_method

    disabled = await service.admin_disable_mfa(user_id, AdminDisableMfaCommand(user_id=user_id))
    assert not disabled.mfa_enabled
    service.mfa_repo.deactivate_method.assert_called_with(mock_method)
