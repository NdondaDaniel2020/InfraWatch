"""Serviço de domínio para registro de ações e verificação forense da integridade da trilha de auditoria."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.enums import AuditResult
from src.contexts.iam.database.models import AuditLogModel
from src.contexts.iam.repositories.audit_repository import AuditRepository
from src.core.security.audit import GENESIS_HASH, compute_audit_hash

logger = logging.getLogger("infrawatch.iam.audit")


class AuditService:
    """Gerencia a emissão atômica de logs de auditoria e auditorias criptográficas de integridade."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repository = AuditRepository(session)

    async def record_action(
        self,
        *,
        action: str,
        resource_type: str,
        resource_id: str,
        actor_user_id: UUID | None = None,
        organization_id: UUID | None = None,
        result: str = AuditResult.SUCCESS,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AuditLogModel:
        """Persiste um registro de auditoria na mesma transação atômica da operação executada."""
        record = await self.repository.add_record(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            result=result,
            details=details,
            ip_address=ip_address,
        )
        logger.info(
            "Ação de auditoria registrada: [%s] em %s:%s por usuário=%s | hash=%s",
            action,
            resource_type,
            resource_id,
            actor_user_id,
            record.hash,
        )
        return record

    async def verify_audit_trail_integrity(
        self,
        *,
        organization_id: UUID | None = None,
        records: list[AuditLogModel] | None = None,
    ) -> tuple[bool, list[str]]:
        """Verifica a integridade criptográfica e a continuidade encadeada da trilha de auditoria.

        Retorna:
            (True, []) se toda a cadeia estiver matematicamente intacta e contínua.
            (False, [erros]) caso qualquer registro tenha sofrido adulteração, remoção ou reordenação.
        """
        audit_records = (
            records
            if records is not None
            else await self.repository.list_all_chronological(organization_id=organization_id)
        )
        if not audit_records:
            return True, []

        errors: list[str] = []
        expected_previous_hash: str | None = None

        for idx, record in enumerate(audit_records):
            # 1. Validação de encadeamento cronológico (Hash Chaining)
            if idx == 0:
                if record.previous_hash is not None and record.previous_hash != GENESIS_HASH:
                    errors.append(
                        f"Registro inicial id={record.id} possui previous_hash incorreto: "
                        f"{record.previous_hash} (esperado: None ou {GENESIS_HASH})"
                    )
            else:
                if record.previous_hash != expected_previous_hash:
                    errors.append(
                        f"Quebra de encadeamento no registro id={record.id} (índice={idx}): "
                        f"previous_hash={record.previous_hash} divergente do hash anterior esperado={expected_previous_hash}"
                    )

            # 2. Recomputação matemática do hash SHA-256 a partir dos dados persistidos
            recomputed_hash = compute_audit_hash(
                id=str(record.id),
                actor_user_id=str(record.actor_user_id) if record.actor_user_id else None,
                action=record.action,
                resource_type=record.resource_type,
                resource_id=record.resource_id,
                result=record.result,
                details=record.details,
                created_at=record.created_at,
                previous_hash=record.previous_hash,
            )

            if record.hash != recomputed_hash:
                errors.append(
                    f"Adulteração detectada no registro id={record.id}: "
                    f"hash persistido={record.hash} divergente do hash recalculado={recomputed_hash}"
                )

            expected_previous_hash = record.hash

        is_valid = len(errors) == 0
        if not is_valid:
            logger.error(
                "ALERTA DE SEGURANÇA: Violação de integridade na auditoria! Detalhes: %s", errors
            )
        else:
            logger.info(
                "Auditoria forense concluída com sucesso: %s registros validados sem violações.",
                len(audit_records),
            )

        return is_valid, errors

    async def get_logs_paginated(
        self,
        *,
        organization_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[AuditLogModel], int]:
        """Consulta registros de auditoria paginados."""
        return await self.repository.list_paginated(
            organization_id=organization_id,
            offset=offset,
            limit=limit,
        )
