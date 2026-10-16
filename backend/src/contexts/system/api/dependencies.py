"""Injeção de dependências para as rotas da API do contexto de Sistema."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.system.services.backup_service import BackupService

# Instância Singleton do serviço de backup para a aplicação
_backup_service_instance = BackupService()


def get_backup_service() -> BackupService:
    """Provedor de dependência para a instância singleton do BackupService."""
    return _backup_service_instance


BackupServiceDep = Annotated[BackupService, Depends(get_backup_service)]

__all__ = [
    "BackupServiceDep",
    "get_backup_service",
]
