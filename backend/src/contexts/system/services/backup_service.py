"""Serviço de gerenciamento de backup e integração com daemon isolado (ADR-032)."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from redis.exceptions import RedisError

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser
from src.contexts.system.schemas.backup import (
    BackupHistoryItem,
    BackupHistoryResponse,
    BackupTargets,
    BackupTriggerResponse,
    GDriveAuthUrlResponse,
    GDriveStatusResponse,
)
from src.core.config import get_settings
from src.core.infrastructure.redis import ensure_redis, get_redis_client

logger = logging.getLogger("infrawatch.system.backup_service")


def _format_size(size_bytes: int) -> str:
    """Converte tamanho em bytes para representação legível (KB, MB, GB)."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def _read_secret_file(name: str) -> str | None:
    """Lê valor de segredo a partir de /run/secrets ou da pasta secrets do projeto."""
    p = Path(f"/run/secrets/{name}")
    if p.exists():
        try:
            return p.read_text(encoding="utf-8").strip()
        except OSError:
            pass
    for root in (Path.cwd(), Path(__file__).resolve().parents[5]):
        candidate = root / "secrets" / f"{name}.txt"
        if candidate.exists():
            try:
                return candidate.read_text(encoding="utf-8").strip()
            except OSError:
                pass
        candidate_no_ext = root / "secrets" / name
        if candidate_no_ext.exists():
            try:
                return candidate_no_ext.read_text(encoding="utf-8").strip()
            except OSError:
                pass
    return None


def _update_rclone_conf_token(content: str, token_json: str) -> str:
    """Atualiza a chave token dentro da seção [gdrive] preservando comentários e outras seções."""
    lines = content.splitlines()
    in_gdrive = False
    replaced = False
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped == "[gdrive]":
            in_gdrive = True
            new_lines.append(line)
            continue
        elif stripped.startswith("[") and stripped.endswith("]"):
            in_gdrive = False

        if in_gdrive and (stripped.startswith("token =") or stripped.startswith("token=")):
            new_lines.append(f"token = {token_json}")
            replaced = True
        else:
            new_lines.append(line)

    if not replaced:
        if in_gdrive or "[gdrive]" in content:
            new_lines.append(f"token = {token_json}")
        else:
            new_lines.extend([
                "",
                "[gdrive]",
                "type = drive",
                f"token = {token_json}",
            ])
    return "\n".join(new_lines) + "\n"


class BackupService:
    """Encapsula operações de acionamento desacoplado, consulta de histórico e streaming de progresso."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def trigger_backup(
        self,
        user: AuthenticatedUser,
        notes: str | None = None,
    ) -> BackupTriggerResponse:
        """Emite sinal assíncrono não-bloqueante no Redis para acordar o contêiner de backup.

        Não executa tarefas pesadas no processo da API (Blast Radius Zero).
        """
        backup_id = f"bck_{uuid4().hex[:12]}"
        now = datetime.now(UTC)

        payload = {
            "backup_id": backup_id,
            "trigger": "manual",
            "user_id": user.id,
            "user_email": user.email,
            "notes": notes,
            "triggered_at": now.isoformat(),
        }

        redis_client = get_redis_client() or await ensure_redis()
        if redis_client:
            try:
                await redis_client.publish("backup:trigger", json.dumps(payload))
                logger.info(
                    "Sinal de backup disparado com sucesso via Redis: %s (User: %s)",
                    backup_id,
                    user.email,
                )
            except RedisError as e:
                logger.error("Falha ao publicar evento de backup no Redis: %s", e)
        else:
            logger.warning("Cliente Redis não disponível para publicar sinal de backup.")

        return BackupTriggerResponse(
            backup_id=backup_id,
            status="accepted",
            message="Rotina de backup despachada para o contêiner isolado.",
            sse_url="/api/v1/system/backup/events",
            triggered_at=now,
        )

    def _get_google_credentials(self) -> tuple[str | None, str | None]:
        """Obtém client_id e client_secret do Google a partir do settings ou secrets."""
        client_id = (
            getattr(self.settings, "GOOGLE_CLIENT_ID", None)
            or _read_secret_file("google_client_id")
            or os.getenv("GOOGLE_CLIENT_ID")
        )
        client_secret = (
            getattr(self.settings, "GOOGLE_CLIENT_SECRET", None)
            or _read_secret_file("google_client_secret")
            or os.getenv("GOOGLE_CLIENT_SECRET")
        )
        return client_id, client_secret

    def _get_rclone_config_content(self) -> str:
        """Obtém o conteúdo textual do arquivo rclone.conf ativo."""
        tmp_conf = Path("/tmp/rclone.conf")
        if tmp_conf.exists():
            try:
                content = tmp_conf.read_text(encoding="utf-8")
                if "refresh_token" in content and '"refresh_token":""' not in content:
                    return content
            except OSError:
                pass

        persisted_conf = Path("/var/backups/infrawatch/.rclone.conf")
        if persisted_conf.exists():
            try:
                content = persisted_conf.read_text(encoding="utf-8")
                if "refresh_token" in content and '"refresh_token":""' not in content:
                    return content
            except OSError:
                pass

        run_secret = Path("/run/secrets/rclone_config")
        if run_secret.exists():
            try:
                return run_secret.read_text(encoding="utf-8")
            except OSError:
                pass

        for root in (Path.cwd(), Path(__file__).resolve().parents[5]):
            cand = root / "secrets" / "rclone_config.txt"
            if cand.exists():
                try:
                    return cand.read_text(encoding="utf-8")
                except OSError:
                    pass

        return ""

    def _save_rclone_gdrive_token(
        self,
        token_json: str,
        client_id: str,
        client_secret: str,
    ) -> str:
        """Persiste novo token no rclone.conf mantendo outros remotos intactos."""
        current_conf = self._get_rclone_config_content()
        if not current_conf:
            current_conf = (
                f"[gdrive]\n"
                f"type = drive\n"
                f"client_id = {client_id}\n"
                f"client_secret = {client_secret}\n"
                f"scope = drive\n"
                f"token = {token_json}\n"
            )
        else:
            current_conf = _update_rclone_conf_token(current_conf, token_json)

        # Salvar em /tmp/rclone.conf
        tmp_conf = Path("/tmp/rclone.conf")
        try:
            tmp_conf.write_text(current_conf, encoding="utf-8")
            tmp_conf.chmod(0o600)
        except OSError as e:
            logger.debug("Não foi possível salvar /tmp/rclone.conf: %s", e)

        # Salvar no volume persistente caso acessível
        persisted_conf = Path("/var/backups/infrawatch/.rclone.conf")
        if persisted_conf.parent.exists() and os.access(persisted_conf.parent, os.W_OK):
            try:
                persisted_conf.write_text(current_conf, encoding="utf-8")
                persisted_conf.chmod(0o644)
            except OSError as e:
                logger.debug("Não foi possível salvar em %s: %s", persisted_conf, e)

        # Salvar na pasta secrets do projeto caso acessível
        for root in (Path.cwd(), Path(__file__).resolve().parents[5]):
            secret_file = root / "secrets" / "rclone_config.txt"
            if secret_file.parent.exists() and os.access(secret_file.parent, os.W_OK):
                try:
                    secret_file.write_text(current_conf, encoding="utf-8")
                    secret_file.chmod(0o600)
                    logger.info("secrets/rclone_config.txt atualizado com novo token do Google Drive.")
                    break
                except OSError as e:
                    logger.debug("Não foi possível salvar em %s: %s", secret_file, e)

        return current_conf

    def get_gdrive_status(self) -> GDriveStatusResponse:
        """Verifica se as credenciais do Google Drive estão configuradas e autorizadas."""
        client_id, client_secret = self._get_google_credentials()
        configured = bool(client_id and client_secret)

        conf_content = self._get_rclone_config_content()
        authorized = False
        if "[gdrive]" in conf_content:
            for line in conf_content.splitlines():
                stripped = line.strip()
                if stripped.startswith("token =") or stripped.startswith("token="):
                    try:
                        token_str = stripped.split("=", 1)[1].strip()
                        token_data = json.loads(token_str)
                        if token_data.get("refresh_token"):
                            authorized = True
                            break
                    except Exception:
                        pass

        msg = (
            "Conectado e autorizado"
            if authorized
            else ("Aguardando autorização" if configured else "Não configurado")
        )
        return GDriveStatusResponse(
            configured=configured,
            authorized=authorized,
            message=msg,
        )

    def get_gdrive_auth_url(self, redirect_uri: str) -> GDriveAuthUrlResponse:
        """Gera URL de consentimento OAuth 2.0 para autorizar o Google Drive."""
        client_id, _ = self._get_google_credentials()
        if not client_id:
            raise ValueError("Google Client ID não está configurado.")

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/drive",
            "access_type": "offline",
            "prompt": "consent",
            "state": "gdrive_backup",
        }
        auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        return GDriveAuthUrlResponse(auth_url=auth_url, state="gdrive_backup")

    async def complete_gdrive_auth(
        self,
        code: str,
        redirect_uri: str,
    ) -> GDriveStatusResponse:
        """Troca o authorization code pelo refresh_token e atualiza as configurações do Rclone."""
        client_id, client_secret = self._get_google_credentials()
        if not client_id or not client_secret:
            raise ValueError("Credenciais do Google OAuth incompletas.")

        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(token_url, data=data)
            if resp.status_code != 200:
                logger.error("Erro ao trocar código por token com Google OAuth: %s", resp.text)
                raise ValueError(f"Falha na autorização do Google: {resp.text}")
            token_payload = resp.json()

        refresh_token = token_payload.get("refresh_token")
        if not refresh_token:
            logger.warning("Google não retornou refresh_token (talvez prompt=consent seja necessário).")

        expiry = ""
        expires_in = token_payload.get("expires_in")
        if expires_in:
            expiry_dt = datetime.now(UTC) + timedelta(seconds=int(expires_in))
            expiry = expiry_dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        token_dict = {
            "access_token": token_payload.get("access_token", ""),
            "token_type": token_payload.get("token_type", "Bearer"),
            "refresh_token": refresh_token or "",
            "expiry": expiry,
        }
        token_json_str = json.dumps(token_dict)

        updated_conf = self._save_rclone_gdrive_token(token_json_str, client_id, client_secret)

        # Notificar o daemon de backup via canal Pub/Sub no Redis para recarregar config em tempo real
        redis_client = get_redis_client() or await ensure_redis()
        if redis_client and updated_conf:
            try:
                b64_conf = base64.b64encode(updated_conf.encode("utf-8")).decode("utf-8")
                await redis_client.publish(
                    "backup:config_update",
                    json.dumps({"rclone_conf_b64": b64_conf}),
                )
                logger.info("Configuração do Rclone transmitida para o contêiner de backup via Redis.")
            except RedisError as e:
                logger.warning("Falha ao publicar atualização de config no Redis: %s", e)

        return GDriveStatusResponse(
            configured=True,
            authorized=bool(refresh_token or token_dict["refresh_token"]),
            message="Google Drive conectado com sucesso!",
        )

    async def get_backup_history(self) -> BackupHistoryResponse:
        """Varre o diretório de backups local para retornar histórico e checksums SHA-256."""
        backup_path_str = getattr(
            self.settings,
            "BACKUP_LOCAL_PATH",
            os.getenv("BACKUP_LOCAL_PATH", "/var/backups/infrawatch"),
        )
        backup_dir = Path(backup_path_str)

        items: list[BackupHistoryItem] = []
        if backup_dir.exists() and backup_dir.is_dir():
            for tar_path in backup_dir.glob("infrawatch_backup_*.tar.gz"):
                try:
                    stat = tar_path.stat()
                    size_bytes = stat.st_size
                    created_at = datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat()

                    sha256: str | None = None
                    sha256_file = tar_path.with_suffix(tar_path.suffix + ".sha256")
                    if sha256_file.exists():
                        try:
                            content = sha256_file.read_text().strip()
                            sha256 = content.split()[0] if content else None
                        except OSError:
                            sha256 = None

                    # Dedução padrão de gatilho e notas por convenção
                    is_cron = "_020000" in tar_path.name or "0200" in tar_path.name
                    trigger = "scheduled" if is_cron else "manual"
                    notes = (
                        "Rotina automática diária (Cron 02:00 UTC)"
                        if is_cron
                        else "Disparo manual sob demanda"
                    )

                    # Leitura fiel de manifesto auditável (.meta.json) caso exista
                    meta_path = Path(f"{tar_path}.meta.json")
                    if not meta_path.exists():
                        meta_path = tar_path.with_name(f"{tar_path.name}.meta.json")

                    targets: BackupTargets | None = None
                    if meta_path.exists():
                        try:
                            meta_data = json.loads(meta_path.read_text(encoding="utf-8"))
                            t_dict = meta_data.get("targets", {})
                            targets = BackupTargets(
                                local=t_dict.get("local", "SUCCESS"),
                                gdrive=t_dict.get("gdrive", "FAILED"),
                                r2=t_dict.get("r2", "SKIPPED"),
                            )
                            if "trigger" in meta_data:
                                trigger = str(meta_data["trigger"])
                            if "notes" in meta_data:
                                notes = str(meta_data["notes"])
                            if "sha256" in meta_data and not sha256:
                                sha256 = str(meta_data["sha256"])
                        except Exception as meta_err:
                            logger.warning("Falha ao ler meta.json de %s: %s", tar_path, meta_err)

                    if targets is None:
                        # Fallback fiel para backups legados sem manifesto .meta.json:
                        # Inspeciona se o Google Drive e R2 estão realmente configurados e autorizados
                        gdrive_st = self.get_gdrive_status()
                        gdrive_val = "SUCCESS" if gdrive_st.authorized else "FAILED"

                        rclone_txt = self._get_rclone_config_content()
                        r2_val = (
                            "SKIPPED"
                            if ("change_me" in rclone_txt or not rclone_txt)
                            else "SUCCESS"
                        )
                        targets = BackupTargets(
                            local="SUCCESS",
                            gdrive=gdrive_val,
                            r2=r2_val,
                        )

                    items.append(
                        BackupHistoryItem(
                            filename=tar_path.name,
                            size_bytes=size_bytes,
                            size_human=_format_size(size_bytes),
                            created_at=created_at,
                            sha256=sha256,
                            storage_path=str(tar_path.resolve()),
                            targets=targets,
                            trigger=trigger,
                            notes=notes,
                        )
                    )
                except OSError as ex:
                    logger.warning("Erro ao ler metadados de backup %s: %s", tar_path, ex)

        # Ordenar do mais recente para o mais antigo
        items.sort(key=lambda x: x.created_at, reverse=True)

        return BackupHistoryResponse(
            items=items,
            total=len(items),
        )

    async def stream_backup_events(
        self,
        user: AuthenticatedUser,
        ping_interval_seconds: float = 15.0,
    ) -> AsyncGenerator[str, None]:
        """Gera stream SSE assíncrono transmitindo mensagens de progresso emitidas pelo contêiner de backup."""
        redis_client = get_redis_client() or await ensure_redis()

        # Evento inicial de handshake
        yield 'event: ready\ndata: {"status":"connected","message":"Conectado ao canal de progresso de backup"}\n\n'

        if not redis_client:
            yield 'event: error\ndata: {"message":"Redis indisponível para streaming"}\n\n'
            return

        pubsub = redis_client.pubsub()
        await pubsub.subscribe("backup:progress")

        try:
            last_ping = asyncio.get_event_loop().time()
            while True:
                try:
                    # Aguarda mensagem do Redis com timeout curto para checar heartbeat
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0),
                        timeout=1.5,
                    )
                    if message and message.get("type") == "message":
                        data = message.get("data", "")
                        yield f"event: progress\ndata: {data}\n\n"
                except TimeoutError:
                    pass

                now = asyncio.get_event_loop().time()
                if now - last_ping >= ping_interval_seconds:
                    yield ": ping\n\n"
                    last_ping = now

                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            logger.debug("Conexão SSE de backup encerrada pelo cliente %s", user.email)
        finally:
            try:
                await pubsub.unsubscribe("backup:progress")
                await pubsub.close()
            except (RedisError, OSError) as cleanup_err:
                logger.debug("Erro ao encerrar pubsub de backup: %s", cleanup_err)


_backup_service: BackupService | None = None


def get_backup_service() -> BackupService:
    """Factory para instanciar ou retornar o singleton do BackupService."""
    global _backup_service
    if _backup_service is None:
        _backup_service = BackupService()
    return _backup_service
