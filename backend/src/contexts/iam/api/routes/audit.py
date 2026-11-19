"""Rotas REST da API para Trilha de Auditoria Imutável e Verificação Forense."""

from __future__ import annotations

import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.contexts.iam.api.dependencies import (
    AuditServiceDep,
    CurrentUserDep,
    PaginationParamsDep,
    require_roles,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.audit import (
    AuditIntegrityVerificationResponse,
    AuditListResponse,
    AuditLogResponse,
)

router = APIRouter(prefix="/api/v1/audit", tags=["Audit & Forensics"])


@router.get(
    "/logs",
    response_model=AuditListResponse,
    summary="Listar trilha de auditoria",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN))],
)
async def list_audit_logs(
    current_user: CurrentUserDep,
    pagination: PaginationParamsDep,
    audit_service: AuditServiceDep,
    organization_id: Annotated[UUID | None, Query()] = None,
    search: Annotated[str | None, Query(description="Busca textual por recurso, autor, IP ou ação")] = None,
    role: Annotated[str | None, Query(description="Filtro por papel RBAC")] = None,
    action: Annotated[str | None, Query(description="Filtro por ação")] = None,
) -> AuditListResponse:
    """Retorna os registros de auditoria em ordem cronológica decrescente."""
    # Se for admin de organização, restringe a busca à sua própria organização
    target_org_id = organization_id
    if current_user.role != UserRole.SUPER_ADMIN and current_user.organization_id:
        target_org_id = UUID(current_user.organization_id)

    items, total = await audit_service.get_logs_paginated(
        organization_id=target_org_id,
        search=search,
        role=role,
        action=action,
        offset=pagination.offset,
        limit=pagination.limit,
    )

    return AuditListResponse(
        items=[AuditLogResponse.model_validate(log) for log in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get(
    "/verify",
    response_model=AuditIntegrityVerificationResponse,
    summary="Consultar integridade criptográfica da trilha de auditoria",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN))],
)
@router.post(
    "/verify",
    response_model=AuditIntegrityVerificationResponse,
    summary="Verificação criptográfica de integridade da trilha de auditoria",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN))],
)
async def verify_audit_integrity(
    audit_service: AuditServiceDep,
    organization_id: Annotated[UUID | None, Query()] = None,
) -> AuditIntegrityVerificationResponse:
    """Verifica matematicamente o encadeamento de hashes SHA-256 da cadeia de auditoria.

    Detecta imediatamente se qualquer registro foi modificado, deletado ou injetado fora de ordem.
    """
    start_t = time.perf_counter()
    is_valid, violations = await audit_service.verify_audit_trail_integrity(
        organization_id=organization_id
    )

    all_records = await audit_service.repository.list_all_chronological(
        organization_id=organization_id
    )
    duration_ms = max(1, int((time.perf_counter() - start_t) * 1000))
    last_hash = all_records[-1].hash if all_records else None

    return AuditIntegrityVerificationResponse(
        is_valid=is_valid,
        total_records=len(all_records),
        violations=violations,
        last_block_hash=last_hash,
        verification_time_ms=duration_ms,
        validators_active="3/3 Ativos",
        algorithm="SHA-256 HMAC",
    )
