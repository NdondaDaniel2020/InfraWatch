"""Testes unitários para RefreshTokenRepository."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.iam.database.models import RefreshTokenModel
from src.contexts.iam.repositories.refresh_token_repository import RefreshTokenRepository


@pytest.mark.asyncio
async def test_refresh_token_repository_lifecycle() -> None:
    """Valida ciclo completo de criação, busca, listagem e revogação de tokens."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    repo = RefreshTokenRepository(mock_session)

    session_id = uuid4()
    user_id = uuid4()
    now = datetime.now(UTC)
    expires = now + timedelta(days=7)

    # 1. create & save
    token_record = RefreshTokenModel(
        id=session_id,
        user_id=user_id,
        token_hash="hash123",
        expires_at=expires,
    )
    res_save = await repo.save(token_record)
    assert res_save == token_record
    mock_session.add.assert_called_with(token_record)
    mock_session.flush.assert_called()

    res_create = await repo.create(
        session_id=session_id,
        user_id=user_id,
        token_hash="hash_created",
        expires_at=expires,
        ip_address="192.168.1.10",
        user_agent="pytest-client",
        device_name="Linux Box",
    )
    assert res_create.token_hash == "hash_created"

    # 2. get_by_id
    mock_session.get.return_value = token_record
    res_id = await repo.get_by_id(session_id)
    assert res_id == token_record

    # 3. get_by_token_hash (com e sem load_user)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = token_record
    mock_session.execute.return_value = mock_result

    res_hash = await repo.get_by_token_hash("hash123", load_user=True)
    assert res_hash == token_record

    res_hash_no_user = await repo.get_by_token_hash("hash123", load_user=False)
    assert res_hash_no_user == token_record

    # 4. list_active_by_user
    mock_list_res = MagicMock()
    mock_list_res.scalars.return_value.all.return_value = [token_record]
    mock_session.execute.return_value = mock_list_res

    active_tokens = await repo.list_active_by_user(user_id)
    assert len(active_tokens) == 1

    # 5. revoke_by_id_and_user
    rev_result = MagicMock(rowcount=1)
    mock_session.execute.return_value = rev_result
    assert await repo.revoke_by_id_and_user(session_id, user_id) is True

    # 6. revoke_and_return_ids & revoke_other_sessions
    ids_result = MagicMock()
    ids_result.scalars.return_value.all.return_value = [session_id]
    mock_session.execute.side_effect = [ids_result, MagicMock()]

    revoked_ids = await repo.revoke_and_return_ids(user_id, current_token_hash="other_hash")
    assert revoked_ids == [session_id]

    # Lista vazia ao revogar
    empty_ids = MagicMock()
    empty_ids.scalars.return_value.all.return_value = []
    mock_session.execute.side_effect = [empty_ids]
    assert await repo.revoke_and_return_ids(user_id) == []

    # revoke_all_for_user
    mock_session.execute.side_effect = None
    mock_session.execute.return_value = MagicMock()
    await repo.revoke_all_for_user(user_id)

    # 7. delete_expired
    del_result = MagicMock(rowcount=5)
    mock_session.execute.return_value = del_result
    deleted_count = await repo.delete_expired(before=now)
    assert deleted_count == 5
