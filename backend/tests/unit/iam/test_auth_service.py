"""Testes unitários para o AuthService (IAM)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.services.auth_service import AuthService, _ensure_utc
from src.contexts.iam.services.token_service import TokenPairResponse
from src.core.database.unit_of_work import AbstractUnitOfWork
from src.core.exceptions import (
    AccountLockedOutError,
    AuthenticationError,
    InvalidMfaPendingTokenError,
)


def test_ensure_utc_utility() -> None:
    """Valida normalização para timezone UTC."""
    assert _ensure_utc(None) is None
    dt_naive = datetime(2026, 1, 1, 12, 0, 0)  # noqa: DTZ001
    dt_utc = _ensure_utc(dt_naive)
    assert dt_utc.tzinfo == UTC


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
async def test_authenticate_user_success_no_mfa(mock_uow_and_session) -> None:
    """Valida autenticação direta com sucesso para usuário sem MFA."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()

    user = UserModel(
        id=user_id,
        email="operador@corp.ao",
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        mfa_enabled=False,
    )
    mock_user_repo.get_by_email.return_value = user

    mock_token_svc = AsyncMock()
    mock_token_svc.create_token_pair.return_value = TokenPairResponse(
        access_token="acc",
        refresh_token="ref",
        token_type="Bearer",
        expires_in=900,
    )

    mock_rate_limit = AsyncMock()
    mock_rate_limit.pre_login_check = AsyncMock()
    mock_rate_limit.register_successful_login = AsyncMock()

    service = AuthService(
        uow_or_session=mock_uow,
        user_repository=mock_user_repo,
        token_service=mock_token_svc,
        rate_limit_service=mock_rate_limit,
    )

    with (
        patch("src.contexts.iam.services.auth_service.constant_time_verify", return_value=True),
        patch("src.contexts.iam.services.auth_service.OutboxRepository.add_event") as mock_outbox,
    ):
        ret_user, tokens = await service.authenticate(
            email="operador@corp.ao",
            password="Password@123",
            client_ip="192.168.1.100",
            user_agent="Mozilla/5.0",
        )

        assert ret_user.email == "operador@corp.ao"
        assert isinstance(tokens, TokenPairResponse)
        assert tokens.access_token == "acc"
        mock_rate_limit.register_successful_login.assert_called_once()
        mock_outbox.assert_called_once()
        mock_uow.commit.assert_called_once()


@pytest.mark.asyncio
async def test_authenticate_user_with_mfa_required(mock_uow_and_session) -> None:
    """Valida retorno de desafio MFA com token efêmero para usuário com MFA ativo."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()

    user = UserModel(
        id=user_id,
        email="mfa_user@corp.ao",
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        mfa_enabled=True,
    )
    mock_user_repo.get_by_email.return_value = user

    mock_rate_limit = AsyncMock()
    mock_rate_limit.pre_login_check = AsyncMock()
    mock_rate_limit.register_successful_login = AsyncMock()

    service = AuthService(
        uow_or_session=mock_uow,
        user_repository=mock_user_repo,
        rate_limit_service=mock_rate_limit,
    )

    with (
        patch("src.contexts.iam.services.auth_service.constant_time_verify", return_value=True),
        patch(
            "src.contexts.iam.services.auth_service.create_mfa_pending_token",
            return_value="mfa_pending_token_123",
        ),
    ):
        ret_user, pending_token = await service.authenticate(
            email="mfa_user@corp.ao",
            password="Password@123",
            client_ip="192.168.1.100",
        )

        assert ret_user.email == "mfa_user@corp.ao"
        assert pending_token == "mfa_pending_token_123"


@pytest.mark.asyncio
async def test_authenticate_rate_limit_and_invalid_credentials(mock_uow_and_session) -> None:
    """Valida bloqueio por taxa de tentativas e falha de senha com mensagem neutra."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user = UserModel(id=uuid4(), email="target@corp.ao", hashed_password="hash", is_active=True)
    mock_user_repo.get_by_email.return_value = user

    mock_rate_limit = AsyncMock()
    mock_rate_limit.pre_login_check.side_effect = AccountLockedOutError(retry_after=900)

    service = AuthService(
        uow_or_session=mock_uow,
        user_repository=mock_user_repo,
        rate_limit_service=mock_rate_limit,
    )

    # 1. Rate limited na pré-checagem
    with pytest.raises(AccountLockedOutError):
        await service.authenticate("target@corp.ao", "pwd", client_ip="1.2.3.4")

    # 2. Senha incorreta (constant_time_verify falso)
    mock_rate_limit.pre_login_check.side_effect = None
    mock_rate_limit.register_failed_login = AsyncMock()

    with patch("src.contexts.iam.services.auth_service.constant_time_verify", return_value=False):
        with pytest.raises(AuthenticationError, match="Credenciais inválidas"):
            await service.authenticate("target@corp.ao", "wrong_pwd", client_ip="1.2.3.4")
        mock_rate_limit.register_failed_login.assert_called_once()


@pytest.mark.asyncio
async def test_authenticate_mfa_challenge_and_finalize_login(mock_uow_and_session) -> None:
    """Valida finalização de login após validação do token temporário de MFA."""
    mock_uow, _ = mock_uow_and_session
    mock_user_repo = AsyncMock()
    user_id = uuid4()
    user = UserModel(id=user_id, email="mfa@corp.ao", is_active=True, mfa_enabled=True)
    mock_user_repo.get_by_id.return_value = user

    mock_token_svc = AsyncMock()
    mock_token_svc.create_token_pair.return_value = TokenPairResponse(
        access_token="acc_mfa",
        refresh_token="ref_mfa",
        token_type="Bearer",
        expires_in=900,
    )

    service = AuthService(
        uow_or_session=mock_uow,
        user_repository=mock_user_repo,
        token_service=mock_token_svc,
    )

    # 1. Token pendente inválido
    with (
        patch(
            "src.contexts.iam.services.auth_service.decode_mfa_pending_token",
            side_effect=ValueError("bad token"),
        ),
        pytest.raises(InvalidMfaPendingTokenError),
    ):
        await service.authenticate_mfa_challenge(mfa_pending_token="invalid_token", code="123456")

    # 2. Desafio validado com sucesso
    with (
        patch(
            "src.contexts.iam.services.auth_service.decode_mfa_pending_token",
            return_value={"sub": str(user_id)},
        ),
        patch(
            "src.contexts.iam.services.auth_service.MfaService.verify_challenge", return_value=True
        ),
        patch("src.contexts.iam.services.auth_service.OutboxRepository.add_event"),
    ):
        ret_user, tokens = await service.authenticate_mfa_challenge(
            mfa_pending_token="valid_mfa_token", code="123456", client_ip="10.0.0.1"
        )
        assert ret_user.id == user_id
        assert tokens.access_token == "acc_mfa"
        mock_uow.commit.assert_called_once()
