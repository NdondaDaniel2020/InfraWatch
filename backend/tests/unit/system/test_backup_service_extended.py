"""Testes unitários estendidos para BackupService (Issue #220 / ADR-032)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from redis.exceptions import RedisError

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.system.services.backup_service import (
    BackupService,
    _read_secret_file,
    _update_rclone_conf_token,
)


def test_read_secret_file_variations(tmp_path: Path) -> None:
    """Valida leitura segura de segredos em arquivos com fallbacks."""
    # Arquivo não existe
    assert _read_secret_file("non_existent_secret") is None

    # Arquivo temporário simulado em /tmp
    dummy_secret = tmp_path / "dummy_secret"
    dummy_secret.write_text("secret_value_123 \n")
    with (
        patch("src.contexts.system.services.backup_service.Path.exists", return_value=True),
        patch(
            "src.contexts.system.services.backup_service.Path.read_text",
            return_value="secret_value_123 \n",
        ),
    ):
        val = _read_secret_file("dummy_secret")
        assert val == "secret_value_123"


def test_update_rclone_conf_token_scenarios() -> None:
    """Valida atualização e inserção de tokens OAuth no rclone.conf."""
    token_json = json.dumps({"access_token": "acc", "refresh_token": "ref"})

    # Caso 1: Seção [gdrive] já existe com token existente
    existing_conf = (
        "[other_remote]\ntype = s3\n\n"
        '[gdrive]\ntype = drive\nclient_id = cid\ntoken = {"refresh_token":"old"}\n'
    )
    updated = _update_rclone_conf_token(existing_conf, token_json)
    assert f"token = {token_json}" in updated
    assert "[other_remote]" in updated

    # Caso 2: Seção [gdrive] existe mas não tem token ainda
    no_token_conf = "[gdrive]\ntype = drive\nclient_id = cid\n"
    updated_no_tok = _update_rclone_conf_token(no_token_conf, token_json)
    assert f"token = {token_json}" in updated_no_tok

    # Caso 3: Não existe [gdrive] no arquivo
    empty_conf = "[other]\ntype = local\n"
    updated_empty = _update_rclone_conf_token(empty_conf, token_json)
    assert "[gdrive]" in updated_empty
    assert f"token = {token_json}" in updated_empty


def test_get_gdrive_auth_url_and_status(tmp_path: Path) -> None:
    """Valida geração de URL de consentimento e consulta de status OAuth do GDrive."""
    service = BackupService()

    # Erro: sem client_id
    with (
        patch.object(service, "_get_google_credentials", return_value=(None, None)),
        pytest.raises(ValueError, match="Google Client ID não está configurado"),
    ):
        service.get_gdrive_auth_url("https://infrawatch.corp/callback")

    # Sucesso ao gerar URL
    with patch.object(
        service, "_get_google_credentials", return_value=("google_client_id_123", "secret")
    ):
        auth_data = service.get_gdrive_auth_url("https://infrawatch.corp/callback")
        assert "accounts.google.com" in auth_data.auth_url
        assert "client_id=google_client_id_123" in auth_data.auth_url
        assert auth_data.state == "gdrive_backup"

    # Status: não configurado
    with patch.object(service, "_get_google_credentials", return_value=(None, None)):
        st_unconf = service.get_gdrive_status()
        assert not st_unconf.configured
        assert not st_unconf.authorized
        assert "Não configurado" in st_unconf.message

    # Status: configurado mas sem autorização
    with (
        patch.object(service, "_get_google_credentials", return_value=("cid", "sec")),
        patch.object(service, "_get_rclone_config_content", return_value=""),
    ):
        st_waiting = service.get_gdrive_status()
        assert st_waiting.configured
        assert not st_waiting.authorized
        assert "Aguardando autorização" in st_waiting.message

    # Status: configurado e autorizado
    valid_conf = '[gdrive]\ntype = drive\ntoken = {"refresh_token": "valid_refresh"}\n'
    with (
        patch.object(service, "_get_google_credentials", return_value=("cid", "sec")),
        patch.object(service, "_get_rclone_config_content", return_value=valid_conf),
    ):
        st_ok = service.get_gdrive_status()
        assert st_ok.configured
        assert st_ok.authorized
        assert "Conectado e autorizado" in st_ok.message


@pytest.mark.asyncio
async def test_complete_gdrive_auth_flows() -> None:
    """Valida troca do authorization code por tokens OAuth."""
    mock_http = AsyncMock(spec=httpx.AsyncClient)
    service = BackupService(http_client=mock_http)

    # Erro de credenciais ausentes
    with (
        patch.object(service, "_get_google_credentials", return_value=(None, None)),
        pytest.raises(ValueError, match="Credenciais do Google OAuth incompletas"),
    ):
        await service.complete_gdrive_auth("code123", "https://redirect")

    # Erro de resposta do Google (HTTP 400)
    mock_resp_err = MagicMock()
    mock_resp_err.status_code = 400
    mock_resp_err.text = "invalid_grant"
    mock_http.post.return_value = mock_resp_err

    with (
        patch.object(service, "_get_google_credentials", return_value=("cid", "sec")),
        pytest.raises(ValueError, match="Falha na autorização do Google: invalid_grant"),
    ):
        await service.complete_gdrive_auth("code123", "https://redirect")

    # Sucesso na troca com expires_in e notificação Redis
    mock_resp_ok = MagicMock()
    mock_resp_ok.status_code = 200
    mock_resp_ok.json.return_value = {
        "access_token": "new_access_token",
        "token_type": "Bearer",
        "refresh_token": "new_refresh_token",
        "expires_in": 3600,
    }
    mock_http.post.return_value = mock_resp_ok

    mock_redis = AsyncMock()
    mock_redis.publish.return_value = 1

    with (
        patch.object(service, "_get_google_credentials", return_value=("cid", "sec")),
        patch.object(service, "_save_rclone_gdrive_token", return_value="[gdrive]\ntoken = ok\n"),
        patch(
            "src.contexts.system.services.backup_service.get_redis_client", return_value=mock_redis
        ),
    ):
        res = await service.complete_gdrive_auth("code123", "https://redirect")
        assert res.configured
        assert res.authorized
        mock_redis.publish.assert_called_once()
        ch, _ = mock_redis.publish.call_args[0]
        assert ch == "backup:config_update"


@pytest.mark.asyncio
async def test_trigger_backup_redis_errors_and_missing() -> None:
    """Valida comportamento defensivo ao disparar backup com Redis indisponível ou em erro."""
    user = AuthenticatedUser(id="u1", email="admin@corp.ao", role=UserRole.SUPER_ADMIN.value)
    service = BackupService()

    # Redis indisponível (None)
    with (
        patch("src.contexts.system.services.backup_service.get_redis_client", return_value=None),
        patch("src.contexts.system.services.backup_service.ensure_redis", return_value=None),
    ):
        res_none = await service.trigger_backup(user)
        assert res_none.status == "accepted"

    # Redis com exceção RedisError
    mock_redis = AsyncMock()
    mock_redis.publish.side_effect = RedisError("Connection lost")
    with patch(
        "src.contexts.system.services.backup_service.get_redis_client", return_value=mock_redis
    ):
        res_err = await service.trigger_backup(user)
        assert res_err.status == "accepted"


def test_format_size() -> None:
    """Valida conversão legível de bytes para KiB, MiB, GiB."""
    from src.contexts.system.services.backup_service import _format_size

    assert _format_size(500) == "500 B"
    assert "KB" in _format_size(2048)
    assert "MB" in _format_size(10 * 1024 * 1024)
    assert "GB" in _format_size(5 * 1024 * 1024 * 1024)


@pytest.mark.asyncio
async def test_get_backup_history_and_storage_status(tmp_path: Path) -> None:
    """Valida varredura de backups e cálculo de armazenamento local."""
    from src.contexts.system.services.backup_service import get_backup_service

    service = get_backup_service()
    service.settings = MagicMock()
    service.settings.BACKUP_LOCAL_PATH = str(tmp_path)

    # 1. Diretório vazio
    hist_empty = await service.get_backup_history()
    assert hist_empty.total == 0
    assert len(hist_empty.items) == 0

    # 2. Criar backup simulado
    tar_file = tmp_path / "infrawatch_backup_20261126_020000.tar.gz"
    tar_file.write_bytes(b"dummy backup data")
    sha_file = tmp_path / "infrawatch_backup_20261126_020000.tar.gz.sha256"
    sha_file.write_text(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  backup.tar.gz"
    )

    meta_file = tmp_path / "infrawatch_backup_20261126_020000.tar.gz.meta.json"
    meta_file.write_text(
        json.dumps(
            {
                "trigger": "scheduled",
                "notes": "Cron test",
                "targets": {"local": "SUCCESS", "gdrive": "SUCCESS", "r2": "SKIPPED"},
            }
        )
    )

    hist = await service.get_backup_history()
    assert hist.total == 1
    assert (
        hist.items[0].sha256 == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    assert hist.items[0].trigger == "scheduled"
    assert hist.items[0].targets.gdrive == "SUCCESS"

    # 3. Storage status
    with (
        patch("shutil.disk_usage", return_value=(100_000_000, 20_000_000, 80_000_000)),
        patch.object(service, "get_gdrive_status") as mock_gst,
    ):
        mock_gst.return_value = MagicMock(configured=False, authorized=False)
        storage = await service.get_storage_status()
        assert storage.local.total_bytes == 100_000_000
        assert storage.local.used_bytes == 20_000_000
        assert storage.gdrive.status == "Não Configurado"


@pytest.mark.asyncio
async def test_fetch_gdrive_quota_scenarios() -> None:
    """Valida consulta de quota do Google Drive em múltiplos cenários (não configurado, não autorizado, sucesso e erro na API)."""
    mock_http = AsyncMock(spec=httpx.AsyncClient)
    service = BackupService(http_client=mock_http)

    # 1. Não configurado
    with patch.object(
        service, "get_gdrive_status", return_value=MagicMock(configured=False, authorized=False)
    ):
        res_unconf = await service._fetch_gdrive_quota()
        assert res_unconf.status == "Não Configurado"

    # 2. Não autorizado
    with patch.object(
        service,
        "get_gdrive_status",
        return_value=MagicMock(configured=True, authorized=False, email="u@corp.ao"),
    ):
        res_unauth = await service._fetch_gdrive_quota()
        assert res_unauth.status == "Não Conectado"

    # 3. Configurado e autorizado, sucesso na API
    valid_conf = '[gdrive]\ntype = drive\ntoken = {"access_token":"acc1","refresh_token":"ref1"}\n'
    mock_st = MagicMock(configured=True, authorized=True, email="user@gmail.com")

    # Resposta de renovação de token se precisar, ou da quota do Drive
    mock_quota_resp = MagicMock()
    mock_quota_resp.status_code = 200
    mock_quota_resp.json.return_value = {
        "user": {"displayName": "John", "emailAddress": "user@gmail.com"},
        "storageQuota": {"limit": "15000000000", "usage": "5000000000"},
    }
    mock_http.get.return_value = mock_quota_resp

    with (
        patch.object(service, "get_gdrive_status", return_value=mock_st),
        patch.object(service, "_get_google_credentials", return_value=("cid", "sec")),
        patch.object(service, "_get_rclone_config_content", return_value=valid_conf),
    ):
        res_ok = await service._fetch_gdrive_quota()
        assert "CONECTADO" in res_ok.status.upper()
        assert res_ok.total_bytes == 15000000000
        assert res_ok.used_bytes == 5000000000

    # 4. Falha na chamada da API do Google (exceção HTTP)
    mock_http.get.side_effect = httpx.RequestError("Network timeout")
    with (
        patch.object(service, "get_gdrive_status", return_value=mock_st),
        patch.object(service, "_get_google_credentials", return_value=("cid", "sec")),
        patch.object(service, "_get_rclone_config_content", return_value=valid_conf),
    ):
        res_fail = await service._fetch_gdrive_quota()
        assert "CONECTADO" in res_fail.status.upper()


@pytest.mark.asyncio
async def test_stream_backup_events_scenarios() -> None:
    """Valida streaming SSE de eventos de progresso de backup."""
    user = AuthenticatedUser(id="u1", email="admin@corp.ao", role=UserRole.SUPER_ADMIN.value)
    service = BackupService()

    # 1. Sem Redis -> handshake e erro
    with (
        patch("src.contexts.system.services.backup_service.get_redis_client", return_value=None),
        patch("src.contexts.system.services.backup_service.ensure_redis", return_value=None),
    ):
        events = []
        async for chunk in service.stream_backup_events(user):
            events.append(chunk)
        assert any("event: ready" in c for c in events)
        assert any("event: error" in c for c in events)

    # 2. Com Redis -> consome mensagem e encerra
    mock_redis = MagicMock()
    mock_pubsub = AsyncMock()
    mock_redis.pubsub.return_value = mock_pubsub

    # Simula uma mensagem
    mock_pubsub.get_message.return_value = {
        "type": "message",
        "data": '{"progress": 50, "step": "tar"}',
    }

    with patch(
        "src.contexts.system.services.backup_service.get_redis_client", return_value=mock_redis
    ):
        gen = service.stream_backup_events(user)
        item1 = await anext(gen)
        assert "event: ready" in item1
        item2 = await anext(gen)
        assert "progress" in item2
        await gen.aclose()
        mock_pubsub.unsubscribe.assert_called_once()
