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
    targets: BackupTargets = Field(
        default_factory=BackupTargets, description="Status de replicação por destino"
    )
    trigger: str = Field(
        default="scheduled", description="Gatilho de execução: manual ou scheduled"
    )
    notes: str | None = Field(default=None, description="Observações ou descrição da rotina")


class BackupHistoryResponse(BaseModel):
    """Lista paginada ou agregada do histórico de backups disponíveis."""

    items: list[BackupHistoryItem] = Field(default_factory=list)
    total: int = Field(description="Quantidade total de backups encontrados")


class GDriveAuthUrlResponse(BaseModel):
    """Resposta com URL de autorização do Google Drive."""

    auth_url: str = Field(description="URL de autorização OAuth 2.0 do Google")
    state: str = Field(default="gdrive_backup", description="Parâmetro de segurança state")


class GDriveCallbackRequest(BaseModel):
    """Payload para troca do código de autorização por tokens."""

    code: str = Field(description="Authorization code retornado pelo Google")
    redirect_uri: str = Field(description="URI de redirecionamento autorizada")


class GDriveStatusResponse(BaseModel):
    """Status da integração de backup com o Google Drive."""

    configured: bool = Field(
        description="Indica se o client_id e client_secret do Google estão presentes"
    )
    authorized: bool = Field(description="Indica se existe refresh_token ativo no Rclone")
    email: str | None = Field(default=None, description="E-mail da conta vinculada (se disponível)")
    message: str | None = Field(default=None, description="Mensagem de status ou diagnóstico")
    storage_limit_bytes: int | None = Field(
        default=None, description="Limite de armazenamento em bytes"
    )
    storage_usage_bytes: int | None = Field(
        default=None, description="Armazenamento utilizado em bytes"
    )
    storage_limit_human: str | None = Field(default=None, description="Limite legível (ex: 5.0 TB)")
    storage_usage_human: str | None = Field(default=None, description="Uso legível (ex: 8.7 GB)")
    storage_free_human: str | None = Field(default=None, description="Espaço livre legível")
    storage_usage_percent: float | None = Field(default=None, description="Percentual de uso")


class StorageDestinationLocal(BaseModel):
    """Métricas de armazenamento do ambiente local do container (NVMe Host)."""

    status: str = Field(
        default="ONLINE & SINCRONIZADO", description="Status operacional do destino local"
    )
    path: str = Field(
        default="/var/backups/infrawatch", description="Caminho local atômico no filesystem"
    )
    total_bytes: int = Field(default=0, description="Capacidade total do filesystem em bytes")
    used_bytes: int = Field(default=0, description="Espaço ocupado no filesystem em bytes")
    free_bytes: int = Field(default=0, description="Espaço livre no filesystem em bytes")
    total_human: str = Field(default="0 B", description="Capacidade total legível (ex: 33.2 GB)")
    used_human: str = Field(default="0 B", description="Espaço ocupado legível (ex: 24.5 GB)")
    free_human: str = Field(default="0 B", description="Espaço livre legível (ex: 7.0 GB)")
    used_percent: float = Field(default=0.0, description="Percentual de ocupação do disco")
    backups_size_bytes: int = Field(
        default=0, description="Volume total ocupado exclusivamente por backups"
    )
    backups_size_human: str = Field(
        default="0 B", description="Volume de backups legível (ex: 25.0 MB)"
    )
    retention_policy: str = Field(default="7 dias (FIFO)", description="Política de retenção local")
    io_latency: str = Field(
        default="0.4ms (Direct-DMA)", description="Latência média de I/O medida"
    )


class StorageDestinationGDrive(BaseModel):
    """Métricas de armazenamento e quota da nuvem Google Drive."""

    status: str = Field(default="Não Configurado", description="Status da integração Google Drive")
    configured: bool = Field(default=False, description="Credenciais OAuth presentes")
    authorized: bool = Field(default=False, description="Token OAuth ativo e válido")
    email: str | None = Field(default=None, description="E-mail da conta Google conectada")
    display_name: str | None = Field(default=None, description="Nome de exibição da conta Google")
    remote_directory: str = Field(default="—", description="Diretório remoto offsite")
    retention_policy: str = Field(default="—", description="Política de retenção offsite")
    total_bytes: int = Field(default=0, description="Quota total em bytes")
    used_bytes: int = Field(default=0, description="Quota consumida em bytes")
    free_bytes: int = Field(default=0, description="Quota disponível em bytes")
    total_human: str = Field(default="—", description="Quota total legível")
    used_human: str = Field(default="—", description="Uso legível")
    free_human: str = Field(default="—", description="Livre legível")
    used_percent: float = Field(default=0.0, description="Percentual de consumo da quota")


class StorageDestinationR2(BaseModel):
    """Métricas de armazenamento e topologia Cloudflare R2 Object Storage."""

    status: str = Field(
        default="Não Configurado", description="Status operacional do Cloudflare R2"
    )
    configured: bool = Field(default=False, description="Bucket R2 configurado")
    authorized: bool = Field(default=False, description="Bucket R2 acessível e autorizado")
    bucket: str = Field(default="—", description="Nome do bucket S3 compatível")
    replication: str = Field(default="—", description="Topologia de replicação")
    egress_fee: str = Field(default="—", description="Tarifa de saída")
    total_bytes: int = Field(default=0, description="Quota estimada do bucket")
    used_bytes: int = Field(default=0, description="Espaço consumido em bytes")
    free_bytes: int = Field(default=0, description="Espaço disponível em bytes")
    total_human: str = Field(default="—", description="Tamanho total legível")
    used_human: str = Field(default="—", description="Uso legível")
    free_human: str = Field(default="—", description="Livre legível")
    used_percent: float = Field(default=0.0, description="Percentual de ocupação")


class BackupStorageResponse(BaseModel):
    """Visão consolidada da topologia e capacidades dos 3 destinos de backup (ADR-032)."""

    local: StorageDestinationLocal = Field(default_factory=StorageDestinationLocal)
    gdrive: StorageDestinationGDrive = Field(default_factory=StorageDestinationGDrive)
    r2: StorageDestinationR2 = Field(default_factory=StorageDestinationR2)
