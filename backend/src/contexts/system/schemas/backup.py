"""Schemas Pydantic para requisições e respostas de operações de sistema e backup."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class BackupTriggerRequest(BaseModel):
    """Parâmetros de controle para acionamento manual de backup."""

    model_config = ConfigDict(extra="forbid")

    skip_remote: bool = Field(
        default=False,
        description="Se True, não realiza o upload para os provedores de nuvem (Google Drive, Cloudflare R2, AWS S3).",
    )
    dry_run: bool = Field(
        default=False,
        description="Se True, simula a execução do pipeline sem persistir ou alterar arquivos.",
    )


class BackupTriggerResponse(BaseModel):
    """Resposta com status HTTP 202 Accepted ao disparar o backup em background."""

    model_config = ConfigDict(from_attributes=True)

    task_id: str = Field(description="Identificador único da execução do backup.")
    status: str = Field(
        description="Status inicial do agendamento ('accepted', 'in_progress', 'completed', 'failed')."
    )
    message: str = Field(description="Mensagem descritiva da ação iniciada.")
    started_at: datetime = Field(description="Data e hora UTC de início da solicitação.")


class BackupStatusResponse(BaseModel):
    """Detalhes de status e telemetria de uma execução de backup."""

    model_config = ConfigDict(from_attributes=True)

    task_id: str = Field(description="Identificador único da execução.")
    status: str = Field(
        description="Status atual ('accepted', 'in_progress', 'completed', 'failed')."
    )
    message: str = Field(description="Resumo do status atual do pipeline.")
    started_at: datetime = Field(description="Data e hora UTC de início da execução.")
    completed_at: datetime | None = Field(
        default=None,
        description="Data e hora UTC de conclusão, se aplicável.",
    )
    bundle_name: str | None = Field(
        default=None,
        description="Nome do artefato tar.gz gerado (ex: infrawatch_backup_20261016_230000.tar.gz).",
    )
    details: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadados adicionais, como hashes SHA-256 e destinos processados.",
    )
