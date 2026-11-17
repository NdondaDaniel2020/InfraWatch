"""Schemas Pydantic para o gerenciamento de backups e Disaster Recovery (ADR-032)."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class BackupTriggerRequest(BaseModel):
    """Payload opcional para acionamento de rotina de backup manual."""

    notes: str | None = Field(default=None, description="Observações ou motivo do backup manual")


class BackupTriggerResponse(BaseModel):
    """Resposta imediata (HTTP 202) confirmando recepção do comando pelo daemon."""

    backup_id: str = Field(description="Identificador único da operação de backup")
    status: str = Field(default="accepted", description="Status da solicitação")
    message: str = Field(description="Mensagem informativa de despacho")
    sse_url: str = Field(
        default="/api/v1/system/backup/events",
        description="Endpoint para acompanhamento em tempo real via Server-Sent Events",
    )
    triggered_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class BackupTargets(BaseModel):
    """Status de replicação local e nuvem do snapshot."""

    local: str = Field(default="SUCCESS", description="Status do armazenamento local")
    gdrive: str = Field(default="SUCCESS", description="Status do Google Drive")
    r2: str = Field(default="SUCCESS", description="Status do Cloudflare R2")


class BackupHistoryItem(BaseModel):
    """Metadados de um arquivo de backup consolidado armazenado localmente."""

    filename: str = Field(description="Nome do arquivo tar.gz")
    size_bytes: int = Field(description="Tamanho do arquivo em bytes")
    size_human: str = Field(description="Tamanho legível (ex: 12.4 MB)")
    created_at: str = Field(description="Data e hora de criação no formato ISO 8601")
    sha256: str | None = Field(default=None, description="Hash criptográfico SHA-256")
    storage_path: str = Field(description="Caminho completo de armazenamento")
    targets: BackupTargets = Field(default_factory=BackupTargets, description="Status de replicação por destino")
    trigger: str = Field(default="scheduled", description="Gatilho de execução: manual ou scheduled")
    notes: str | None = Field(default=None, description="Observações ou descrição da rotina")


class BackupHistoryResponse(BaseModel):
    """Lista paginada ou agregada do histórico de backups disponíveis."""

    items: list[BackupHistoryItem] = Field(default_factory=list)
    total: int = Field(description="Quantidade total de backups encontrados")
