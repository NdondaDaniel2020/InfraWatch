"""Rotas administrativas de Backup e Disaster Recovery (ADR-032)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from src.contexts.system.api.dependencies import (
    AdminUserDep,
    BackupServiceDep,
    require_admin,
)
from src.contexts.system.schemas.backup import (
    BackupHistoryResponse,
    BackupTriggerRequest,
    BackupTriggerResponse,
    GDriveAuthUrlResponse,
    GDriveCallbackRequest,
    GDriveStatusResponse,
)
from src.contexts.system.services.backup_service import (
    BackupService,
    get_backup_service,
)

logger = logging.getLogger("infrawatch.system.api.backup")

router = APIRouter(
    prefix="/api/v1/system/backup",
    tags=["System & Disaster Recovery"],
    dependencies=[Depends(require_admin())],
)


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=BackupTriggerResponse,
    summary="Disparar rotina de backup manual em segundo plano",
)
async def trigger_manual_backup(
    user: AdminUserDep,
    service: BackupServiceDep,
    body: BackupTriggerRequest | None = None,
) -> BackupTriggerResponse:
    """Aciona a execução do pipeline de backup no contêiner isolado via sinal Redis.

    Retorna HTTP 202 imediatamente sem sobrecarregar a API web (Blast Radius Zero).
    """
    notes = body.notes if body else None
    return await service.trigger_backup(user=user, notes=notes)


@router.get(
    "/events",
    summary="Acompanhar progresso de backup em tempo real via Server-Sent Events (SSE)",
)
async def stream_backup_progress(
    user: AdminUserDep,
    service: BackupServiceDep,
) -> StreamingResponse:
    """Transmite eventos de telemetria e progresso da rotina de backup para o cliente.

    Canal compatível com EventSource nativo do navegador e proxies Nginx (X-Accel-Buffering: no).
    """
    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(
        service.stream_backup_events(user=user),
        media_type="text/event-stream",
        headers=headers,
    )


@router.get(
    "/history",
    response_model=BackupHistoryResponse,
    summary="Listar histórico de backups locais gerados",
)
async def list_backup_history(
    service: BackupServiceDep,
) -> BackupHistoryResponse:
    """Retorna listagem dos backups disponíveis no volume local com tamanhos e hashes SHA-256."""
    return await service.get_backup_history()


@router.get(
    "/gdrive/status",
    response_model=GDriveStatusResponse,
    summary="Obter status de configuração e autorização do Google Drive",
)
async def get_gdrive_status(
    service: BackupServiceDep,
) -> GDriveStatusResponse:
    """Verifica se as credenciais do Google Drive estão configuradas e se há refresh_token válido."""
    return service.get_gdrive_status()


@router.get(
    "/gdrive/auth-url",
    response_model=GDriveAuthUrlResponse,
    summary="Obter URL de autorização OAuth 2.0 para o Google Drive",
)
async def get_gdrive_auth_url(
    service: BackupServiceDep,
    redirect_uri: str = Query(..., description="URI de retorno autorizada"),
) -> GDriveAuthUrlResponse:
    """Gera o link de consentimento OAuth do Google para autorizar o escopo do Google Drive."""
    try:
        return service.get_gdrive_auth_url(redirect_uri=redirect_uri)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.post(
    "/gdrive/callback",
    response_model=GDriveStatusResponse,
    summary="Processar código retornado pelo Google e salvar tokens no Rclone",
)
async def handle_gdrive_callback(
    body: GDriveCallbackRequest,
    service: BackupServiceDep,
) -> GDriveStatusResponse:
    """Recebe o authorization code retornado pelo Google, troca por tokens e salva no Rclone."""
    try:
        return await service.complete_gdrive_auth(
            code=body.code,
            redirect_uri=body.redirect_uri,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e



__all__ = [
    "BackupService",
    "BackupServiceDep",
    "get_backup_service",
    "router",
]
