"""Testes unitários para SystemSettingsRepository (Issue #312)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.system.database.models import SystemSettingModel
from src.contexts.system.database.repository import SystemSettingsRepository
from src.core.security.crypto import encrypt_secret


@pytest.mark.asyncio
async def test_get_by_key_returns_none_when_not_found() -> None:
    """Valida retorno None para chaves inexistentes."""
    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    repo = SystemSettingsRepository(session=mock_session)
    res = await repo.get_by_key("non_existent_key")

    assert res is None


@pytest.mark.asyncio
async def test_get_by_key_decrypts_secret_field() -> None:
    """Valida decifragem transparente de campos confidenciais."""
    raw_token = "my_plain_zabbix_token_123"
    encrypted_val = encrypt_secret(raw_token)

    model = SystemSettingModel(
        key="zabbix.api_token",
        category="zabbix",
        value=encrypted_val,
        is_secret=True,
        updated_at=datetime.now(UTC),
        updated_by=uuid4(),
    )

    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = model
    mock_session.execute.return_value = mock_result

    repo = SystemSettingsRepository(session=mock_session)
    setting = await repo.get_by_key("zabbix.api_token")

    assert setting is not None
    assert setting.key == "zabbix.api_token"
    assert setting.category == "zabbix"
    assert setting.value == raw_token
    assert setting.is_secret is True


@pytest.mark.asyncio
async def test_save_setting_encrypts_when_secret() -> None:
    """Valida que salvar valor com is_secret=True cifra antes de persistir no modelo."""
    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    repo = SystemSettingsRepository(session=mock_session)
    saved = await repo.save_setting(
        key="glpi.user_token",
        category="glpi",
        value="plain_token_abc",
        is_secret=True,
    )

    assert saved.key == "glpi.user_token"
    assert saved.value == "plain_token_abc"
    assert saved.is_secret is True

    # Verifica se add foi chamado com valor cifrado
    mock_session.add.assert_called_once()
    added_model: SystemSettingModel = mock_session.add.call_args[0][0]
    assert added_model.key == "glpi.user_token"
    assert added_model.is_secret is True
    assert added_model.value != "plain_token_abc"
    mock_session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_by_category_and_get_dict() -> None:
    """Valida recuperação em lista e em formato de dicionário por categoria."""
    model1 = SystemSettingModel(
        key="glpi.base_url",
        category="glpi",
        value="https://glpi.rcsangola.co.ao",
        is_secret=False,
    )
    model2 = SystemSettingModel(
        key="glpi.app_token",
        category="glpi",
        value=encrypt_secret("secret_app_token"),
        is_secret=True,
    )

    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [model1, model2]
    mock_session.execute.return_value = mock_result

    repo = SystemSettingsRepository(session=mock_session)
    items = await repo.list_by_category("glpi")

    assert len(items) == 2
    assert items[0].value == "https://glpi.rcsangola.co.ao"
    assert items[1].value == "secret_app_token"

    d = await repo.get_category_dict("glpi")
    assert d == {
        "glpi.base_url": "https://glpi.rcsangola.co.ao",
        "glpi.app_token": "secret_app_token",
    }


@pytest.mark.asyncio
async def test_delete_by_key_and_category() -> None:
    """Valida remoção de configurações por chave e por categoria."""
    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()

    mock_result = MagicMock()
    mock_result.rowcount = 1
    mock_session.execute.return_value = mock_result

    repo = SystemSettingsRepository(session=mock_session)
    deleted_key = await repo.delete_by_key("glpi.base_url")
    assert deleted_key is True

    mock_result.rowcount = 3
    deleted_count = await repo.delete_by_category("glpi")
    assert deleted_count == 3
