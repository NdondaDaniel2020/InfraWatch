"""Rotas REST da API para Trilha de Auditoria Imutável e Verificação Forense."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.api.dependencies import CurrentUserDep, PaginationParamsDep, require_roles
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.audit import (
    AuditIntegrityVerificationResponse,
    AuditListResponse,
    AuditLogResponse,
)
from src.contexts.iam.services.audit_service import AuditService
from src.core.database.session import DbSessionDep

router = APIRouter(prefix="/api/v1/audit", tags=["Audit & Forensics"])


@router.get(
    "/logs",
    response_model=AuditListResponse,
    summary="Listar trilha de auditoria",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN))],
)
async def list_audit_logs(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    pagination: PaginationParamsDep,
    organization_id: Annotated[UUID | None, Query()] = None,
) -> AuditListResponse:
    """Retorna os registros de auditoria em ordem cronológica decrescente."""
    # Se for admin de organização, restringe a busca à sua própria organização
    target_org_id = organization_id
    if current_user.role != UserRole.SUPER_ADMIN and current_user.organization_id:
        target_org_id = UUID(current_user.organization_id)

    audit_service = AuditService(db)
    items, total = await audit_service.get_logs_paginated(
        organization_id=target_org_id,
        offset=pagination.offset,
        limit=pagination.limit,
    )

    return AuditListResponse(
        items=[AuditLogResponse.model_validate(log) for log in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post(
    "/verify",
    response_model=AuditIntegrityVerificationResponse,
    summary="Verificação criptográfica de integridade da trilha de auditoria",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN))],
)
async def verify_audit_integrity(
    db: DbSessionDep,
    organization_id: Annotated[UUID | None, Query()] = None,
) -> AuditIntegrityVerificationResponse:
    """Verifica matematicamente o encadeamento de hashes SHA-256 da cadeia de auditoria.

    Detecta imediatamente se qualquer registro foi modificado, deletado ou injetado fora de ordem.
    """
    audit_service = AuditService(db)
    is_valid, violations = await audit_service.verify_audit_trail_integrity(
        organization_id=organization_id
    )

    all_records = await audit_service.repository.list_all_chronological(
        organization_id=organization_id
    )

    return AuditIntegrityVerificationResponse(
        is_valid=is_valid,
        total_records=len(all_records),
        violations=violations,
    )
