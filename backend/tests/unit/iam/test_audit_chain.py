"""Testes unitários e de integração para Hash Chaining, AuditRepository e verificação forense."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from src.contexts.iam.database.models import Base
from src.contexts.iam.repositories.audit_repository import AuditRepository
from src.contexts.iam.services.audit_service import AuditService
from src.core.exceptions import AuditImmutabilityError
from src.core.security.audit import GENESIS_HASH, compute_audit_hash


@pytest.fixture
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    """Cria uma engine SQLite assíncrona in-memory para isolamento de cada teste."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with session_factory() as session:
        yield session

    await engine.dispose()


def test_compute_audit_hash_deterministic() -> None:
    """Garante que a computação de hash SHA-256 é estritamente determinística."""
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=UTC)
    h1 = compute_audit_hash(
        id="rec-1",
        actor_user_id="user-1",
        action="USER_LOGIN",
        resource_type="User",
        resource_id="user-1",
        result="SUCCESS",
        details={"ip": "127.0.0.1"},
        created_at=now,
        previous_hash=GENESIS_HASH,
    )
    h2 = compute_audit_hash(
        id="rec-1",
        actor_user_id="user-1",
        action="USER_LOGIN",
        resource_type="User",
        resource_id="user-1",
        result="SUCCESS",
        details={"ip": "127.0.0.1"},
        created_at=now,
        previous_hash=GENESIS_HASH,
    )
    assert h1 == h2
    assert len(h1) == 64


def test_compute_audit_hash_detects_tampering() -> None:
    """Garante que qualquer alteração de dados ou do hash anterior altera o hash final."""
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=UTC)
    original = compute_audit_hash(
        id="rec-1",
        actor_user_id="user-1",
        action="USER_LOGIN",
        resource_type="User",
        resource_id="user-1",
        result="SUCCESS",
        details={"ip": "127.0.0.1"},
        created_at=now,
        previous_hash=GENESIS_HASH,
    )

    # Detalhe modificado
    tampered_details = compute_audit_hash(
        id="rec-1",
        actor_user_id="user-1",
        action="USER_LOGIN",
        resource_type="User",
        resource_id="user-1",
        result="SUCCESS",
        details={"ip": "192.168.1.1"},
        created_at=now,
        previous_hash=GENESIS_HASH,
    )
    assert original != tampered_details

    # Previous hash modificado
    tampered_prev_hash = compute_audit_hash(
        id="rec-1",
        actor_user_id="user-1",
        action="USER_LOGIN",
        resource_type="User",
        resource_id="user-1",
        result="SUCCESS",
        details={"ip": "127.0.0.1"},
        created_at=now,
        previous_hash="f" * 64,
    )
    assert original != tampered_prev_hash


@pytest.mark.asyncio
async def test_audit_repository_blocks_mutation(async_session: AsyncSession) -> None:
    """Verifica se o repositório impede operações de UPDATE e DELETE."""
    repo = AuditRepository(async_session)
    with pytest.raises(AuditImmutabilityError):
        await repo.update()

    with pytest.raises(AuditImmutabilityError):
        await repo.delete()


@pytest.mark.asyncio
async def test_audit_service_chaining_and_integrity_verification(
    async_session: AsyncSession,
) -> None:
    """Testa criação encadeada de múltiplos registros e verificação forense da integridade."""
    service = AuditService(async_session)
    actor_id = uuid4()
    org_id = uuid4()

    # 1. Criação do primeiro registro
    r1 = await service.record_action(
        action="ORGANIZATION_CREATED",
        resource_type="Organization",
        resource_id=str(org_id),
        actor_user_id=actor_id,
        organization_id=org_id,
        details={"name": "Empresa Teste"},
    )
    assert r1.previous_hash is None or r1.previous_hash == GENESIS_HASH

    # 2. Criação do segundo registro
    r2 = await service.record_action(
        action="USER_INVITED",
        resource_type="User",
        resource_id=str(uuid4()),
        actor_user_id=actor_id,
        organization_id=org_id,
        details={"email": "colaborador@empresa.ao"},
    )
    assert r2.previous_hash == r1.hash

    # 3. Criação do terceiro registro
    r3 = await service.record_action(
        action="ROLE_ASSIGNED",
        resource_type="User",
        resource_id=str(uuid4()),
        actor_user_id=actor_id,
        organization_id=org_id,
        details={"role": "ORG_ADMIN"},
    )
    assert r3.previous_hash == r2.hash

    # 4. Verificação de integridade da corrente íntegra
    is_valid, errors = await service.verify_audit_trail_integrity(organization_id=org_id)
    assert is_valid is True
    assert errors == []

    # 4.1 Verificação via verify_integrity_report
    valid_rep, viol_rep, count_rep, last_hash = await service.verify_integrity_report(organization_id=org_id)
    assert valid_rep is True
    assert viol_rep == []
    assert count_rep == 3
    assert last_hash == r3.hash

    # 5. Simulação de adulteração (Tampering) passando lista copiada
    import copy

    tampered_records = [r1, copy.copy(r2), r3]
    tampered_records[1].hash = "0123456789abcdef" * 4
    is_valid_tampered, errors_tampered = await service.verify_audit_trail_integrity(
        records=tampered_records
    )
    assert is_valid_tampered is False
    assert len(errors_tampered) >= 1
    assert any(
        "Adulteração detectada" in err or "Quebra de encadeamento" in err for err in errors_tampered
    )


@pytest.mark.asyncio
async def test_orm_level_prevents_audit_log_delete(async_session: AsyncSession) -> None:
    """Garante que o evento SQLAlchemy impede exclusão direta do objeto AuditLogModel."""
    service = AuditService(async_session)
    record = await service.record_action(
        action="SYSTEM_INITIALIZED",
        resource_type="System",
        resource_id="core",
    )
    with pytest.raises(AuditImmutabilityError) as exc_info:
        await async_session.delete(record)
        await async_session.flush()

    assert "estritamente proibidas" in str(exc_info.value)


@pytest.mark.asyncio
async def test_audit_service_multi_tenant_interleaved_chain(
    async_session: AsyncSession,
) -> None:
    """Garante que a cadeia de custódia global funciona corretamente com eventos intercalados entre múltiplas organizações."""
    service = AuditService(async_session)
    actor_id = uuid4()
    org_a = uuid4()
    org_b = uuid4()

    # 1. Registro da Org A (Gênese)
    r1 = await service.record_action(
        action="ORGANIZATION_CREATED",
        resource_type="Organization",
        resource_id=str(org_a),
        actor_user_id=actor_id,
        organization_id=org_a,
        details={"name": "Org A"},
    )
    assert r1.previous_hash is None or r1.previous_hash == GENESIS_HASH

    # 2. Registro da Org B
    r2 = await service.record_action(
        action="ORGANIZATION_CREATED",
        resource_type="Organization",
        resource_id=str(org_b),
        actor_user_id=actor_id,
        organization_id=org_b,
        details={"name": "Org B"},
    )
    assert r2.previous_hash == r1.hash

    # 3. Registro do Sistema (sem organização)
    r3 = await service.record_action(
        action="SYSTEM_MAINTENANCE",
        resource_type="System",
        resource_id="scheduler",
        actor_user_id=actor_id,
        organization_id=None,
    )
    assert r3.previous_hash == r2.hash

    # 4. Segundo registro da Org A
    r4 = await service.record_action(
        action="DEVICE_PAUSED",
        resource_type="Device",
        resource_id=str(uuid4()),
        actor_user_id=actor_id,
        organization_id=org_a,
    )
    assert r4.previous_hash == r3.hash

    # 5. Segundo registro da Org B
    r5 = await service.record_action(
        action="DEVICE_RESUMED",
        resource_type="Device",
        resource_id=str(uuid4()),
        actor_user_id=actor_id,
        organization_id=org_b,
    )
    assert r5.previous_hash == r4.hash

    # Verificação para a Org A: deve ser íntegra, com 2 registros próprios e último hash sendo r4
    valid_a, errs_a, count_a, last_a = await service.verify_integrity_report(organization_id=org_a)
    assert valid_a is True
    assert errs_a == []
    assert count_a == 2
    assert last_a == r4.hash

    # Verificação para a Org B: deve ser íntegra, com 2 registros próprios e último hash sendo r5
    valid_b, errs_b, count_b, last_b = await service.verify_integrity_report(organization_id=org_b)
    assert valid_b is True
    assert errs_b == []
    assert count_b == 2
    assert last_b == r5.hash

    # Verificação global (Super Admin): deve ser íntegra, com 5 registros no total e último hash sendo r5
    valid_all, errs_all, count_all, last_all = await service.verify_integrity_report(organization_id=None)
    assert valid_all is True
    assert errs_all == []
    assert count_all == 5
    assert last_all == r5.hash

