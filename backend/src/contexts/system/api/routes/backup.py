"""Rotas REST para operações administrativas de backup e recuperação de desastre."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.contexts.iam.api.dependencies import (
    CurrentUserDep,
    require_roles,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.system.api.dependencies import BackupServiceDep
from src.contexts.system.schemas.backup import (
    BackupStatusResponse,
    BackupTriggerRequest,
    BackupTriggerResponse,
)

router = APIRouter(prefix="/api/v1/system/backup", tags=["System & Operations"])


@router.post(
    "",
    response_model=BackupTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Disparar backup manual do sistema",
    description=(
        "Dispara o pipeline automatizado de backup multi-destino em segundo plano. "
        "A operação é não-bloqueante e retorna HTTP 202 Accepted imediatamente, "
        "mantendo o tempo de resposta da API sob 100ms e evitando degradação de telemetria."
    ),
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN))],
)
async def trigger_manual_backup(
    current_user: CurrentUserDep,
    backup_service: BackupServiceDep,
    request: BackupTriggerRequest | None = None,
) -> BackupTriggerResponse:
    """Dispara a execução de backup com isolamento em processo background."""
    req = request or BackupTriggerRequest()
    return backup_service.trigger_backup(req, user_id=str(current_user.id))


@router.get(
    "/status",
    response_model=BackupStatusResponse,
    summary="Consultar status da execução de backup mais recente",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR))],
)
async def get_latest_backup_status(
    backup_service: BackupServiceDep,
) -> BackupStatusResponse:
    """Retorna os dados da última execução de backup registrada em memória."""
    latest = backup_service.get_latest_status()
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhuma execução de backup registrada até o momento.",
        )
    return latest


@router.get(
    "/status/{task_id}",
    response_model=BackupStatusResponse,
    summary="Consultar status de um backup específico por task_id",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR))],
)
async def get_backup_task_status(
    task_id: str,
    backup_service: BackupServiceDep,
) -> BackupStatusResponse:
    """Retorna os detalhes de execução de uma tarefa específica de backup."""
    record = backup_service.get_status(task_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tarefa de backup '{task_id}' não encontrada.",
        )
    return record
