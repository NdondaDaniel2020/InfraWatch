"""Testes unitários para o BackupService (ADR-032 / Issue #220)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.system.services.backup_service import BackupService, _format_size


def test_format_size_utility() -> None:
    """Valida conversão de bytes para formatos humanos legíveis."""
    assert _format_size(500) == "500 B"
    assert _format_size(2048) == "2.0 KB"
    assert _format_size(10 * 1024 * 1024) == "10.0 MB"
    assert _format_size(2 * 1024 * 1024 * 1024) == "2.00 GB"


@pytest.mark.asyncio
async def test_trigger_backup_publishes_event_to_redis() -> None:
    """Valida se trigger_backup emite o evento no canal Redis backup:trigger sem travar a API."""
    mock_redis = AsyncMock()
    mock_redis.publish = AsyncMock(return_value=1)

    user = AuthenticatedUser(
        id="usr-admin-123",
        email="noc-admin@rcsangola.co.ao",
        role=UserRole.SUPER_ADMIN.value,
    )

    service = BackupService()

    with patch(
        "src.contexts.system.services.backup_service.get_redis_client", return_value=mock_redis
    ):
        response = await service.trigger_backup(
            user=user, notes="Rotina emergencial antes de manutenção"
        )

    assert response.status == "accepted"
    assert response.backup_id.startswith("bck_")
    assert response.sse_url == "/api/v1/system/backup/events"

    # Verificar chamada no Redis
    mock_redis.publish.assert_called_once()
    channel, raw_payload = mock_redis.publish.call_args[0]
    assert channel == "backup:trigger"

    payload = json.loads(raw_payload)
    assert payload["backup_id"] == response.backup_id
    assert payload["user_id"] == "usr-admin-123"
    assert payload["notes"] == "Rotina emergencial antes de manutenção"
    assert payload["trigger"] == "manual"


@pytest.mark.asyncio
async def test_get_backup_history_reads_directory(tmp_path: Path) -> None:
    """Valida leitura e ordenação de backups existentes e seus hashes SHA-256."""
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    # Criar arquivo de backup simulado e seu hash
    b1 = backup_dir / "infrawatch_backup_20261017_010000.tar.gz"
    b1.write_bytes(b"conteudo-backup-1")
    b1_sha = backup_dir / "infrawatch_backup_20261017_010000.tar.gz.sha256"
    b1_sha.write_text(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  infrawatch_backup_20261017_010000.tar.gz\n"
    )

    b2 = backup_dir / "infrawatch_backup_20261017_020000.tar.gz"
    b2.write_bytes(b"conteudo-backup-2-mais-recente")

    service = BackupService()

    with patch.object(service.settings, "BACKUP_LOCAL_PATH", str(backup_dir)):
        history = await service.get_backup_history()

    assert history.total == 2
    assert len(history.items) == 2

    # Verifica se os arquivos foram catalogados
    filenames = [item.filename for item in history.items]
    assert "infrawatch_backup_20261017_010000.tar.gz" in filenames
    assert "infrawatch_backup_20261017_020000.tar.gz" in filenames

    # Verifica leitura correta do hash SHA-256
    item_with_sha = next(i for i in history.items if i.filename == b1.name)
    assert (
        item_with_sha.sha256 == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )


@pytest.mark.asyncio
async def test_stream_backup_events_emits_messages() -> None:
    """Valida consumo do canal Redis backup:progress e geração de eventos SSE."""
    mock_redis = AsyncMock()
    mock_pubsub = AsyncMock()

    # Simular mensagens recebidas
    messages = [
        {"type": "message", "data": json.dumps({"stage": "dumping", "percent": 30})},
        {"type": "message", "data": json.dumps({"stage": "completed", "percent": 100})},
        None,
    ]

    mock_pubsub.get_message = AsyncMock(side_effect=messages)
    mock_redis.pubsub = MagicMock(return_value=mock_pubsub)

    user = AuthenticatedUser(
        id="usr-admin-123",
        email="noc-admin@rcsangola.co.ao",
        role=UserRole.SUPER_ADMIN.value,
    )

    service = BackupService()

    with patch(
        "src.contexts.system.services.backup_service.get_redis_client", return_value=mock_redis
    ):
        gen = service.stream_backup_events(user=user, ping_interval_seconds=1.0)
        first_event = await anext(gen)
        assert "event: ready" in first_event

        second_event = await anext(gen)
        assert "event: progress" in second_event
        assert "dumping" in second_event

        third_event = await anext(gen)
        assert "event: progress" in third_event
        assert "completed" in third_event
