"""Serviço de gerenciamento de backup e integração com daemon isolado (ADR-032)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from redis.exceptions import RedisError

from src.contexts.iam.api.dependencies.auth import AuthenticatedUser
from src.contexts.system.schemas.backup import (
    BackupHistoryItem,
    BackupHistoryResponse,
    BackupTriggerResponse,
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

                    items.append(
                        BackupHistoryItem(
                            filename=tar_path.name,
                            size_bytes=size_bytes,
                            size_human=_format_size(size_bytes),
                            created_at=created_at,
                            sha256=sha256,
                            storage_path=str(tar_path.resolve()),
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
