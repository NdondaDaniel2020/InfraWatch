"""Testes unitários para o MfaService (TOTP e Backup Codes)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pyotp
import pytest

from src.contexts.iam.database.models import UserModel
from src.contexts.iam.services.mfa_service import MfaService
from src.core.exceptions import (
    AuthenticationError,
    InvalidTotpCodeError,
    MfaNotSetupError,
    NotFoundError,
)


def test_totp_utilities() -> None:
    """Valida geração de segredos, URI de provisioning e verificação temporal de TOTP."""
    secret = MfaService.generate_totp_secret()
    assert len(secret) == 32

    uri = MfaService.get_totp_uri("user@corp.ao", secret, issuer_name="InfraWatch Test")
    assert "otpauth://totp/" in uri
    assert "user%40corp.ao" in uri or "user@corp.ao" in uri
    assert "InfraWatch" in uri

    # Validação do código TOTP correto
    totp = pyotp.TOTP(secret)
    current_code = totp.now()
    assert MfaService.verify_totp_code(secret, current_code)
    assert not MfaService.verify_totp_code(secret, "000000")


def test_backup_codes_generation_and_consumption() -> None:
    """Valida geração de códigos de recuperação e consumo único (burn on use)."""
    codes = MfaService.generate_backup_codes(count=5)
    assert len(codes) == 5
    for c in codes:
        assert len(c) == 9  # XXXX-XXXX
        assert "-" in c

    hashed_list = MfaService.hash_backup_codes(codes)
    assert len(hashed_list) == 5

    # Consumir o primeiro código
    first_code = codes[0]
    valid, updated_list, remaining = MfaService.verify_and_consume_backup_code(
        first_code, hashed_list
    )
    assert valid
    assert remaining == 4
    assert updated_list[0]["used_at"] is not None

    # Tentar reutilizar o mesmo código consumido -> deve falhar
    valid_again, _, remaining_again = MfaService.verify_and_consume_backup_code(
        first_code, updated_list
    )
    assert not valid_again
    assert remaining_again == 4

    # Código inválido
    valid_inv, _, _ = MfaService.verify_and_consume_backup_code("XXXX-XXXX", updated_list)
    assert not valid_inv


@pytest.mark.asyncio
async def test_setup_totp_and_enable() -> None:
    """Valida fluxo de configuração inicial e ativação com primeiro código TOTP."""
    mock_session = AsyncMock()
    service = MfaService(session=mock_session)
    service.mfa_repo = AsyncMock()
    service.user_repo = AsyncMock()

    user_id = uuid4()
    user_model = UserModel(id=user_id, email="totp@corp.ao", mfa_enabled=False)

    # 1. Usuário não encontrado
    service.user_repo.get_by_id.return_value = None
    with pytest.raises(NotFoundError):
        await service.setup_totp(user_id, "totp@corp.ao")

    # 2. Setup inicial
    service.user_repo.get_by_id.return_value = user_model
    secret, uri = await service.setup_totp(user_id, "totp@corp.ao")
    assert len(secret) == 32
    assert "otpauth://" in uri
    service.mfa_repo.upsert_pending_secret.assert_called_once()

    # 3. Enable TOTP com erro (não configurado)
    service.mfa_repo.get_by_user_and_type.return_value = None
    with pytest.raises(MfaNotSetupError):
        await service.enable_totp(user_id, "123456")

    # 4. Enable TOTP com código inválido
    mock_method = MagicMock()
    mock_method.secret = secret
    service.mfa_repo.get_by_user_and_type.return_value = mock_method
    with pytest.raises(InvalidTotpCodeError):
        await service.enable_totp(user_id, "000000")

    # 5. Enable TOTP com código válido
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()
    backup_codes = await service.enable_totp(user_id, valid_code)
    assert len(backup_codes) == 10
    service.mfa_repo.activate_method.assert_called_once()
    assert user_model.mfa_enabled is True
    assert user_model.mfa_type == "totp"


@pytest.mark.asyncio
async def test_disable_totp_and_verify_challenge() -> None:
    """Valida desafio de autenticação e desativação com senha e código."""
    mock_session = AsyncMock()
    service = MfaService(session=mock_session)
    service.mfa_repo = AsyncMock()
    service.user_repo = AsyncMock()

    user_id = uuid4()
    secret = MfaService.generate_totp_secret()
    codes = MfaService.generate_backup_codes(count=5)
    hashed_codes = MfaService.hash_backup_codes(codes)

    user_model = UserModel(
        id=user_id,
        email="mfa@corp.ao",
        mfa_enabled=True,
        mfa_type="totp",
        hashed_password="hashed_password",
    )
    service.user_repo.get_by_id.return_value = user_model

    mock_method = MagicMock()
    mock_method.secret = secret
    mock_method.data = {"backup_codes": hashed_codes}
    service.mfa_repo.get_active_by_user_and_type.return_value = mock_method

    # 1. verify_challenge com TOTP válido
    totp = pyotp.TOTP(secret)
    assert await service.verify_challenge(user_id, totp.now())

    # 2. verify_challenge com código de backup válido
    assert await service.verify_challenge(user_id, codes[0])

    # 3. verify_challenge com código falso
    assert not await service.verify_challenge(user_id, "000000")

    # 4. Desativação com senha correta e TOTP válido
    with patch("src.contexts.iam.services.mfa_service.password_hasher.verify", return_value=True):
        await service.disable_totp(user_id, "SenhaForte@123", totp.now())
        assert user_model.mfa_enabled is False
        service.mfa_repo.deactivate_method.assert_called_with(mock_method)

    # 5. Desativação com senha incorreta
    user_model.mfa_enabled = True
    with (
        patch("src.contexts.iam.services.mfa_service.password_hasher.verify", return_value=False),
        pytest.raises(AuthenticationError, match="Senha incorreta"),
    ):
        await service.disable_totp(user_id, "SenhaErrada", totp.now())

    # 6. Regenerate backup codes
    with patch("src.contexts.iam.services.mfa_service.password_hasher.verify", return_value=True):
        new_codes = await service.regenerate_backup_codes(user_id, "SenhaForte@123")
        assert len(new_codes) == 10
        assert mock_method.data["backup_codes"] is not None
