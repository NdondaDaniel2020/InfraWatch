"""Repositório assíncrono para persistência da trilha de auditoria criptográfica imutável."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.enums import AuditResult
from src.contexts.iam.database.models import AuditLogModel
from src.core.domain.entity import generate_uuid7
from src.core.exceptions import AuditImmutabilityError
from src.core.security.audit import compute_audit_hash


class AuditRepository:
    """Gerencia a persistência atômica da cadeia de auditoria garantindo encadeamento de hashes."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def update(self, *args: Any, **kwargs: Any) -> Any:
        """Impede terminantemente mutações nos registros de auditoria."""
        raise AuditImmutabilityError(
            "A tabela audit_logs é append-only. Operações de UPDATE são estritamente proibidas."
        )

    async def delete(self, *args: Any, **kwargs: Any) -> None:
        """Impede terminantemente exclusões na trilha de auditoria."""
        raise AuditImmutabilityError(
            "A tabela audit_logs é append-only. Operações de DELETE são estritamente proibidas."
        )

    async def add_record(
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
        """Cria e persiste um registro de auditoria criptograficamente encadeado ao anterior."""
        # 1. Busca o hash do registro mais recente da corrente
        last_hash_stmt = (
            select(AuditLogModel.hash)
            .order_by(AuditLogModel.created_at.desc(), AuditLogModel.id.desc())
            .limit(1)
        )
        previous_hash = await self.session.scalar(last_hash_stmt)

        record_id = generate_uuid7()
        now = datetime.now(UTC)

        # 2. Computa o hash SHA-256 integrando o previous_hash
        record_hash = compute_audit_hash(
            id=str(record_id),
            actor_user_id=str(actor_user_id) if actor_user_id else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            result=result,
            details=details,
            created_at=now,
            previous_hash=previous_hash,
        )

        record = AuditLogModel(
            id=record_id,
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            result=result,
            details=details,
            ip_address=ip_address,
            created_at=now,
            previous_hash=previous_hash,
            hash=record_hash,
        )

        return await self.save(record)

    async def save(self, record: AuditLogModel) -> AuditLogModel:
        """Persiste um registro de auditoria na sessão ativa."""
        self.session.add(record)
        await self.session.flush()
        return record

    async def list_paginated(
        self,
        *,
        organization_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[AuditLogModel], int]:
        """Recupera registros de auditoria paginados em ordem cronológica decrescente."""
        query = select(AuditLogModel)
        count_query = select(func.count()).select_from(AuditLogModel)

        if organization_id is not None:
            query = query.where(AuditLogModel.organization_id == organization_id)
            count_query = count_query.where(AuditLogModel.organization_id == organization_id)

        query = query.order_by(AuditLogModel.created_at.desc(), AuditLogModel.id.desc())
        query = query.offset(offset).limit(limit)

        records_res = await self.session.execute(query)
        count_res = await self.session.execute(count_query)

        return list(records_res.scalars().all()), int(count_res.scalar_one())

    async def list_all_chronological(
        self,
        organization_id: UUID | None = None,
    ) -> list[AuditLogModel]:
        """Retorna todos os registros em ordem cronológica estrita (ASC) para verificação forense."""
        query = select(AuditLogModel).order_by(
            AuditLogModel.created_at.asc(), AuditLogModel.id.asc()
        )
        if organization_id is not None:
            query = query.where(AuditLogModel.organization_id == organization_id)

        res = await self.session.execute(query)
        return list(res.scalars().all())
