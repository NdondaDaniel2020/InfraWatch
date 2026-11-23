"""Testes unitários para o UserRepository e mapeamento de agregado de domínio User."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.domain.aggregate import User
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.repositories.user_repository import UserRepository


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    return session


@pytest.fixture
def repo(mock_session):
    return UserRepository(mock_session)


@pytest.mark.asyncio
async def test_find_by_id_returns_domain_user(repo, mock_session):
    user_id = uuid4()
    org_id = uuid4()
    model = UserModel(
        id=user_id,
        email="dev@infrawatch.io",
        hashed_password="hashed_pwd_123",
        full_name="Software Engineer",
        role=UserRole.ORG_ADMIN.value,
        organization_id=org_id,
        is_active=True,
        is_verified=True,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = model
    mock_session.execute.return_value = result_mock

    domain_user = await repo.find_by_id(user_id)
    assert domain_user is not None
    assert isinstance(domain_user, User)
    assert domain_user.id == user_id
    assert domain_user.email == "dev@infrawatch.io"
    assert domain_user.full_name == "Software Engineer"
    assert domain_user.role == UserRole.ORG_ADMIN.value
    assert domain_user.is_active is True


@pytest.mark.asyncio
async def test_find_by_id_returns_none_when_not_found(repo, mock_session):
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = result_mock

    domain_user = await repo.find_by_id(uuid4())
    assert domain_user is None


@pytest.mark.asyncio
async def test_save_accepts_domain_user_for_insert(repo, mock_session):
    user_id = uuid4()
    domain_user = User(
        id=user_id,
        email="newuser@infrawatch.io",
        hashed_password="secret_hash_pwd",
        full_name="Novo Usuario",
        role=UserRole.CLIENT_VIEWER,
    )

    # get_by_id retorna None (novo registro)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = result_mock

    saved_model = await repo.save(domain_user)
    assert saved_model is not None
    assert saved_model.email == "newuser@infrawatch.io"
    assert saved_model.full_name == "Novo Usuario"
    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_save_accepts_domain_user_for_update(repo, mock_session):
    user_id = uuid4()
    existing_model = UserModel(
        id=user_id,
        email="old@infrawatch.io",
        hashed_password="old_hash_pwd",
        full_name="Nome Antigo",
        role=UserRole.CLIENT_VIEWER.value,
        is_active=True,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = existing_model
    mock_session.execute.return_value = result_mock

    domain_user = User(
        id=user_id,
        email="updated@infrawatch.io",
        hashed_password="new_hash_pwd",
        full_name="Nome Atualizado",
        role=UserRole.ORG_ADMIN,
    )
    domain_user.deactivate()

    saved_model = await repo.save(domain_user)
    assert saved_model is not None
    assert saved_model.full_name == "Nome Atualizado"
    assert saved_model.role == UserRole.ORG_ADMIN.value
    assert saved_model.is_active is False
    mock_session.flush.assert_awaited_once()
