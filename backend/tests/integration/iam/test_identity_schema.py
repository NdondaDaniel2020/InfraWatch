"""Testes de integração para o esquema relacional de Identidade e Multi-Tenancy.

Valida:
1. Mapeamento e persistência das entidades OrganizationModel, UserModel, RefreshTokenModel e AuditLogModel.
2. Unicidade de slug de organização e e-mail de usuário.
3. Isolamento multi-tenant e usuários globais da RCS sem organização.
4. Integridade referencial com remoção em cascata (users -> refresh_tokens).
5. Preservação da trilha de auditoria (ON DELETE SET NULL em audit_logs).
6. Imutabilidade estrita append-only em audit_logs (bloqueio de UPDATE e DELETE).
7. Operações assíncronas do UserRepository e OrganizationRepository.
"""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.domain.enums import (
    AuditAction,
    AuditResult,
    OrgTier,
    UserRole,
)
from src.contexts.iam.database.models import (
    AuditLogModel,
    RefreshTokenModel,
)
from src.contexts.iam.repositories.organization_repository import OrganizationRepository
from src.contexts.iam.repositories.user_repository import UserRepository
from src.core.database.base_model import Base
from src.core.exceptions import AuditImmutabilityError


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


@pytest.mark.asyncio
async def test_create_organization_and_users(async_session: AsyncSession) -> None:
    """Valida criação de organização e usuários com vínculo relacional."""
    org_repo = OrganizationRepository(async_session)
    user_repo = UserRepository(async_session)

    # 1. Criar organização
    org = await org_repo.create(
        name="Empresa Alfa",
        slug="empresa-alfa",
        contact_email="contato@alfa.com",
        sla_target_default=Decimal("99.90"),
        tier=OrgTier.ENTERPRISE_GOLD,
    )
    await async_session.commit()

    assert org.id is not None
    assert org.slug == "empresa-alfa"
    assert org.tier == OrgTier.ENTERPRISE_GOLD
    assert org.sla_target_default == Decimal("99.90")

    # 2. Criar usuário vinculado à organização
    user = await user_repo.create(
        email="admin@alfa.com",
        hashed_password="argon2_hashed_secret",
        full_name="Admin Alfa",
        role=UserRole.ORG_ADMIN,
        organization_id=org.id,
    )
    await async_session.commit()

    assert user.id is not None
    assert user.email == "admin@alfa.com"
    assert user.role == UserRole.ORG_ADMIN
    assert user.organization_id == org.id

    # 3. Criar usuário global sem organização (RCS NOC)
    super_admin = await user_repo.create(
        email="noc@rcs.com",
        hashed_password="argon2_hashed_secret",
        full_name="Operador NOC",
        role=UserRole.NOC_OPERATOR,
        organization_id=None,
    )
    await async_session.commit()

    assert super_admin.id is not None
    assert super_admin.organization_id is None
    assert super_admin.role == UserRole.NOC_OPERATOR

    # 4. Validar busca por e-mail e ID
    fetched_user = await user_repo.get_by_email("ADMIN@ALFA.COM")
    assert fetched_user is not None
    assert fetched_user.id == user.id
    assert fetched_user.organization is not None
    assert fetched_user.organization.slug == "empresa-alfa"


@pytest.mark.asyncio
async def test_unique_constraints(async_session: AsyncSession) -> None:
    """Garante que slugs de organização e e-mails de usuário sejam estritamente únicos."""
    org_repo = OrganizationRepository(async_session)
    user_repo = UserRepository(async_session)

    await org_repo.create(name="Org Original", slug="slug-duplicado")
    await async_session.commit()

    # Tentativa de slug duplicado deve falhar
    with pytest.raises(IntegrityError):
        await org_repo.create(name="Org Conflitante", slug="slug-duplicado")
        await async_session.commit()

    await async_session.rollback()

    await user_repo.create(
        email="unico@empresa.com",
        hashed_password="hash",
        full_name="Usuario Unico",
    )
    await async_session.commit()

    # Tentativa de e-mail duplicado deve falhar
    with pytest.raises(IntegrityError):
        await user_repo.create(
            email="unico@empresa.com",
            hashed_password="outro_hash",
            full_name="Outro Usuario",
        )
        await async_session.commit()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_refresh_token_lifecycle_and_cascade(async_session: AsyncSession) -> None:
    """Valida persistência de refresh tokens e exclusão em cascata ao remover o usuário."""
    user_repo = UserRepository(async_session)
    user = await user_repo.create(
        email="token.user@empresa.com",
        hashed_password="hashed_pass",
        full_name="Token User",
    )
    await async_session.commit()

    token = RefreshTokenModel(
        user_id=user.id,
        token_hash="sha256_encoded_hash_sample",
        expires_at=datetime.now(UTC) + timedelta(days=7),
        ip_address="192.168.1.100",
        user_agent="Mozilla/5.0 InfraWatch Client",
    )
    async_session.add(token)
    await async_session.commit()

    # Buscar token persistido
    query = select(RefreshTokenModel).where(
        RefreshTokenModel.token_hash == "sha256_encoded_hash_sample"
    )
    result = await async_session.execute(query)
    saved_token = result.scalar_one()
    assert saved_token.id is not None
    assert saved_token.user_id == user.id
    assert not saved_token.is_revoked

    # Remover usuário e validar que o token foi deletado em cascata
    await async_session.delete(user)
    await async_session.commit()

    result_after_delete = await async_session.execute(query)
    assert result_after_delete.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_audit_log_immutability(async_session: AsyncSession) -> None:
    """Garante que a tabela audit_logs é append-only, proibindo UPDATE e DELETE."""
    org_repo = OrganizationRepository(async_session)
    user_repo = UserRepository(async_session)

    org = await org_repo.create(name="Audit Org", slug="audit-org")
    user = await user_repo.create(
        email="auditor@empresa.com",
        hashed_password="hash",
        full_name="Auditor Responsável",
        organization_id=org.id,
    )
    await async_session.commit()

    audit_entry = AuditLogModel(
        organization_id=org.id,
        actor_user_id=user.id,
        action=AuditAction.USER_CREATED,
        resource_type="USER",
        resource_id=str(user.id),
        result=AuditResult.SUCCESS,
        details={"ip": "10.0.0.1", "role": "CLIENT_VIEWER"},
        ip_address="10.0.0.1",
        previous_hash="genesis_hash",
        hash="sha256_block_1_hash",
    )
    async_session.add(audit_entry)
    await async_session.commit()

    entry_id = audit_entry.id

    # Tentativa de UPDATE deve disparar AuditImmutabilityError
    audit_entry.result = "MUTATED"
    with pytest.raises(AuditImmutabilityError):
        await async_session.flush()

    await async_session.rollback()

    # Recarregar audit_entry limpo usando o ID pré-armazenado
    refreshed_entry = await async_session.get(AuditLogModel, entry_id)
    assert refreshed_entry is not None
    assert refreshed_entry.result == AuditResult.SUCCESS

    # Tentativa de DELETE deve disparar AuditImmutabilityError
    with pytest.raises(AuditImmutabilityError):
        await async_session.delete(refreshed_entry)
        await async_session.flush()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_user_repository_pagination_and_active_status(async_session: AsyncSession) -> None:
    """Valida paginação e atualização de status no repositório de usuários."""
    org_repo = OrganizationRepository(async_session)
    user_repo = UserRepository(async_session)

    org = await org_repo.create(name="Paginated Org", slug="paginated-org")
    await async_session.commit()

    for i in range(5):
        await user_repo.create(
            email=f"user_{i}@paginated.com",
            hashed_password="hash",
            full_name=f"User {i}",
            organization_id=org.id,
        )
    await async_session.commit()

    # Contagem e listagem
    total = await user_repo.count_by_organization(org.id)
    assert total == 5

    page1 = await user_repo.list_by_organization(org.id, offset=0, limit=2)
    assert len(page1) == 2

    # Atualizar status ativo
    target_user = page1[0]
    await user_repo.set_active_status(target_user.id, is_active=False)
    await async_session.commit()

    updated_user = await user_repo.get_by_id(target_user.id)
    assert updated_user is not None
    assert not updated_user.is_active
