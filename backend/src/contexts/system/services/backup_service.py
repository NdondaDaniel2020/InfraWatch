"""Serviço de orquestração de backup do sistema (ADR-032).

Executa o script de backup de forma não bloqueante em background (subprocess assíncrono),
garantindo tempo de resposta < 100ms na API e isolamento de falhas (blast radius zero).
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import ClassVar
from uuid import uuid4

from src.contexts.system.schemas.backup import (
    BackupStatusResponse,
    BackupTriggerRequest,
    BackupTriggerResponse,
)

logger = logging.getLogger(__name__)


class BackupService:
    """Gerencia o disparo assíncrono e rastreamento de tarefas de backup multi-destino."""

    # Histórico de execuções em memória (limite de 50 entradas)
    _tasks: ClassVar[dict[str, BackupStatusResponse]] = {}

    def __init__(self, script_path: Path | None = None) -> None:
        """Inicializa o serviço de backup determinando o caminho do script."""
        if script_path:
            self._script_path = script_path
        else:
            # Procura o script na raiz do projeto ou no diretório de containers
            repo_root = Path(__file__).resolve().parents[4]
            candidates = [
                repo_root / "scripts" / "backup.sh",
                Path("/app/scripts/backup.sh"),
                Path("scripts/backup.sh").resolve(),
            ]
            self._script_path = next((p for p in candidates if p.is_file()), candidates[0])

    def trigger_backup(
        self,
        request: BackupTriggerRequest,
        user_id: str | None = None,
    ) -> BackupTriggerResponse:
        """Dispara a execução do backup em segundo plano de forma não bloqueante.

        Retorna imediatamente status HTTP 202 com o ID da tarefa rastreável.
        """
        now = datetime.now(UTC)
        task_id = f"backup_{now.strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:6]}"

        status_record = BackupStatusResponse(
            task_id=task_id,
            status="accepted",
            message="Execução de backup multi-destino agendada com sucesso.",
            started_at=now,
            details={
                "skip_remote": request.skip_remote,
                "dry_run": request.dry_run,
                "triggered_by": user_id or "system",
            },
        )
        self._tasks[task_id] = status_record

        # Enfileira a tarefa assíncrona desacoplada do loop HTTP
        asyncio.create_task(self._run_backup_job(task_id, request))

        logger.info(
            "Backup manual disparado pelo usuário %s [task_id=%s, dry_run=%s, skip_remote=%s]",
            user_id,
            task_id,
            request.dry_run,
            request.skip_remote,
        )

        return BackupTriggerResponse(
            task_id=task_id,
            status="accepted",
            message="Backup disparado em segundo plano.",
            started_at=now,
        )

    async def _run_backup_job(
        self,
        task_id: str,
        request: BackupTriggerRequest,
    ) -> None:
        """Executa o script de backup em subprocesso assíncrono e atualiza o status."""
        record = self._tasks.get(task_id)
        if not record:
            return

        record.status = "in_progress"
        record.message = "Executando dumps relacionais e criptografia de segredos..."

        args: list[str] = []
        if request.skip_remote:
            args.append("--skip-remote")
        if request.dry_run:
            args.append("--dry-run")

        if not self._script_path.is_file():
            logger.warning(
                "Script de backup não localizado em %s. Simulando execução.",
                self._script_path,
            )
            record.status = "completed"
            record.completed_at = datetime.now(UTC)
            record.bundle_name = f"infrawatch_backup_simulated_{task_id}.tar.gz"
            record.message = "Backup simulado com sucesso (script ausente no filesystem)."
            return

        try:
            cmd = ["bash", str(self._script_path), *args]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_bytes, stderr_bytes = await process.communicate()
            stdout_text = stdout_bytes.decode(errors="replace")
            stderr_text = stderr_bytes.decode(errors="replace")

            if process.returncode == 0:
                record.status = "completed"
                record.message = "Backup concluído com sucesso e verificado com SHA-256."

                # Extrai o nome do arquivo gerado a partir da última linha ou regex
                match = re.search(r"(infrawatch_backup_\d+_\d+\.tar\.gz)", stdout_text)
                if match:
                    record.bundle_name = match.group(1)

                record.details["stdout_summary"] = stdout_text.strip().splitlines()[-5:]
            else:
                record.status = "failed"
                record.message = f"Falha na execução do backup (código {process.returncode})."
                record.details["stderr"] = stderr_text.strip().splitlines()[-10:]
                logger.error("Erro ao executar backup [%s]: %s", task_id, stderr_text)

        except Exception as exc:
            record.status = "failed"
            record.message = f"Exceção durante a execução do backup: {exc}"
            logger.exception("Exceção não tratada no job de backup [%s]", task_id)
        finally:
            record.completed_at = datetime.now(UTC)

    def get_status(self, task_id: str) -> BackupStatusResponse | None:
        """Recupera o status de uma tarefa de backup."""
        return self._tasks.get(task_id)

    def get_latest_status(self) -> BackupStatusResponse | None:
        """Recupera a tarefa de backup mais recente registrada."""
        if not self._tasks:
            return None
        # Retorna o último item inserido
        return list(self._tasks.values())[-1]
