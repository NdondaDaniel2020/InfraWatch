"""Testes unitários diretos para os route handlers de MFA (TOTP)."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.contexts.iam.api.routes.mfa import (
    disable_mfa,
    enable_mfa,
    regenerate_backup_codes,
    setup_mfa,
)
from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.mfa import (
    MfaDisableRequest,
    MfaEnableRequest,
    MfaRegenerateBackupCodesRequest,
)
from src.core.exceptions import (
    AuthenticationError,
    InvalidMfaConfirmationError,
    InvalidTotpCodeError,
    MfaNotActiveError,
    MfaNotSetupError,
    NotFoundError,
)


@pytest.mark.asyncio
async def test_mfa_setup_handler() -> None:
    """Valida setup_mfa com sucesso e exceções."""
    mock_service = AsyncMock()
    user_id = uuid4()
    current_user = AuthenticatedUser(
        id=str(user_id),
        email="mfa@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
    )

    mock_service.setup_totp.return_value = ("SECRET32", "otpauth://totp/InfraWatch:mfa@corp.ao")

    res = await setup_mfa(current_user=current_user, mfa_service=mock_service)
    assert res.secret == "SECRET32"
    assert "otpauth://" in res.otpauth_uri

    mock_service.setup_totp.side_effect = NotFoundError("User not found")
    with pytest.raises(HTTPException) as err:
        await setup_mfa(current_user=current_user, mfa_service=mock_service)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_mfa_enable_handler() -> None:
    """Valida enable_mfa com sucesso e erros de validação."""
    mock_service = AsyncMock()
    user_id = uuid4()
    current_user = AuthenticatedUser(
        id=str(user_id),
        email="mfa@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
    )

    mock_service.enable_totp.return_value = ["code1", "code2"]

    body = MfaEnableRequest(code="123456")
    res = await enable_mfa(body=body, current_user=current_user, mfa_service=mock_service)
    assert len(res.backup_codes) == 2

    # Erros
    for exc, code in [
        (MfaNotSetupError("Not setup"), 400),
        (InvalidTotpCodeError("Invalid code"), 400),
        (NotFoundError("User"), 404),
    ]:
        mock_service.enable_totp.side_effect = exc
        with pytest.raises(HTTPException) as err:
            await enable_mfa(body=body, current_user=current_user, mfa_service=mock_service)
        assert err.value.status_code == code


@pytest.mark.asyncio
async def test_mfa_disable_handler() -> None:
    """Valida disable_mfa com sucesso e erros."""
    mock_service = AsyncMock()
    user_id = uuid4()
    current_user = AuthenticatedUser(
        id=str(user_id),
        email="mfa@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
    )

    body = MfaDisableRequest(password="Secret123!", code="123456")
    res = await disable_mfa(body=body, current_user=current_user, mfa_service=mock_service)
    assert res["status"] == "ok"

    for exc, code in [
        (MfaNotActiveError("Not active"), 400),
        (InvalidMfaConfirmationError("Wrong code"), 400),
        (AuthenticationError("Wrong password"), 400),
        (NotFoundError("User"), 404),
    ]:
        mock_service.disable_totp.side_effect = exc
        with pytest.raises(HTTPException) as err:
            await disable_mfa(body=body, current_user=current_user, mfa_service=mock_service)
        assert err.value.status_code == code


@pytest.mark.asyncio
async def test_mfa_regenerate_backup_codes_handler() -> None:
    """Valida regenerate_backup_codes com sucesso e erros."""
    mock_service = AsyncMock()
    user_id = uuid4()
    current_user = AuthenticatedUser(
        id=str(user_id),
        email="mfa@corp.ao",
        role=UserRole.NOC_OPERATOR.value,
    )

    mock_service.regenerate_backup_codes.return_value = ["new1", "new2"]

    body = MfaRegenerateBackupCodesRequest(password="Secret123!")
    res = await regenerate_backup_codes(
        body=body, current_user=current_user, mfa_service=mock_service
    )
    assert res.backup_codes == ["new1", "new2"]

    for exc, code in [
        (MfaNotActiveError("Not active"), 400),
        (AuthenticationError("Wrong pass"), 400),
        (NotFoundError("Not found"), 404),
    ]:
        mock_service.regenerate_backup_codes.side_effect = exc
        with pytest.raises(HTTPException) as err:
            await regenerate_backup_codes(
                body=body, current_user=current_user, mfa_service=mock_service
            )
        assert err.value.status_code == code
