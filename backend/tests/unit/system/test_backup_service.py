"""Testes unitários para o BackupService (ADR-032 / Issue #220)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
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

    # Criar manifesto .meta.json fiel para b1
    b1_meta = backup_dir / "infrawatch_backup_20261017_010000.tar.gz.meta.json"
    b1_meta.write_text(
        json.dumps({
            "backup_name": b1.name,
            "trigger": "manual",
            "notes": "Backup com falha no GDrive e R2 ignorado",
            "targets": {
                "local": "SUCCESS",
                "gdrive": "FAILED",
                "r2": "SKIPPED",
            },
        })
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

    # Verifica leitura correta do hash SHA-256 e enriquecimento fiel de targets a partir do .meta.json
    item_with_sha = next(i for i in history.items if i.filename == b1.name)
    assert (
        item_with_sha.sha256 == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    assert item_with_sha.trigger == "manual"
    assert item_with_sha.targets.local == "SUCCESS"
    assert item_with_sha.targets.gdrive == "FAILED"
    assert item_with_sha.targets.r2 == "SKIPPED"
    assert item_with_sha.notes == "Backup com falha no GDrive e R2 ignorado"

    cron_item = next(i for i in history.items if i.filename == b2.name)
    assert cron_item.trigger == "scheduled"
    assert "Cron" in (cron_item.notes or "")


def test_get_gdrive_auth_url() -> None:
    """Valida geração correta de URL de consentimento OAuth do Google Drive."""
    service = BackupService()
    with patch.object(service, "_get_google_credentials", return_value=("test-client-id", "test-secret")):
        response = service.get_gdrive_auth_url("https://localhost/auth/callback")

    assert response.state == "gdrive_backup"
    assert "accounts.google.com" in response.auth_url
    assert "client_id=test-client-id" in response.auth_url
    assert "redirect_uri=https%3A%2F%2Flocalhost%2Fauth%2Fcallback" in response.auth_url
    assert "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive" in response.auth_url


def test_get_gdrive_status() -> None:
    """Valida verificação de status de configuração e autorização do Google Drive."""
    service = BackupService()

    # Cenário 1: Sem credenciais
    with patch.object(service, "_get_google_credentials", return_value=(None, None)):
        st = service.get_gdrive_status()
        assert not st.configured
        assert not st.authorized

    # Cenário 2: Configurado mas sem token no rclone
    with patch.object(service, "_get_google_credentials", return_value=("id", "sec")), \
         patch.object(service, "_get_rclone_config_content", return_value="[gdrive]\ntoken = {\"refresh_token\":\"\"}\n"):
        st = service.get_gdrive_status()
        assert st.configured
        assert not st.authorized

    # Cenário 3: Configurado e autorizado com refresh_token válido
    with patch.object(service, "_get_google_credentials", return_value=("id", "sec")), \
         patch.object(service, "_get_rclone_config_content", return_value="[gdrive]\ntoken = {\"refresh_token\":\"1//valid_token\"}\n"):
        st = service.get_gdrive_status()
        assert st.configured
        assert st.authorized


@pytest.mark.asyncio
async def test_complete_gdrive_auth() -> None:
    """Valida troca de authorization code por tokens e persistência no Rclone."""
    service = BackupService()
    mock_redis = AsyncMock()
    mock_redis.publish = AsyncMock(return_value=1)

    fake_token_response = {
        "access_token": "ya29.test-access-token",
        "refresh_token": "1//test-refresh-token",
        "expires_in": 3600,
        "token_type": "Bearer",
    }

    mock_http_response = MagicMock()
    mock_http_response.status_code = 200
    mock_http_response.json = MagicMock(return_value=fake_token_response)

    with patch.object(service, "_get_google_credentials", return_value=("test-id", "test-secret")), \
         patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_http_response)), \
         patch.object(service, "_save_rclone_gdrive_token", return_value="[gdrive]\ntoken = {}\n"), \
         patch("src.contexts.system.services.backup_service.get_redis_client", return_value=mock_redis):
        result = await service.complete_gdrive_auth(
            code="test-auth-code",
            redirect_uri="https://localhost/auth/callback",
        )

    assert result.configured is True
    assert result.authorized is True
    assert "sucesso" in (result.message or "").lower()
    mock_redis.publish.assert_called_once()
    assert mock_redis.publish.call_args[0][0] == "backup:config_update"



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
