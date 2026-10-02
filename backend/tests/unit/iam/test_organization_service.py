"""Testes unitários para o OrganizationService (src.contexts.iam.services.organization_service)."""

from collections.abc import AsyncGenerator
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.contexts.iam.domain.enums import OrgTier, UserRole
from src.contexts.iam.schemas.organization import OrganizationCreate
from src.contexts.iam.services.organization_service import OrganizationService
from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel
from src.core.exceptions import ConflictError, NotFoundError


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
async def test_create_organization_success(async_session: AsyncSession) -> None:
    service = OrganizationService(async_session)
    data = OrganizationCreate(
        name="Acme Corporation",
        slug="acme-corp",
        contact_email="admin@acme.ao",
        tier=OrgTier.PROFESSIONAL,
        sla_target_default=Decimal("99.95"),
    )

    org = await service.create_organization(data)
    assert org.id is not None
    assert org.name == "Acme Corporation"
    assert org.slug == "acme-corp"
    assert org.tier == OrgTier.PROFESSIONAL.value
    assert org.sla_target_default == Decimal("99.95")

    # Verifica se evento foi inserido no Transactional Outbox
    res = await async_session.execute(
        select(OutboxEventModel).where(OutboxEventModel.event_type == "OrganizationCreatedEvent")
    )
    outbox_event = res.scalars().first()
    assert outbox_event is not None
    assert outbox_event.aggregate_type == "Organization"
    assert str(outbox_event.aggregate_id) == str(org.id)
    assert outbox_event.payload["slug"] == "acme-corp"


@pytest.mark.asyncio
async def test_create_organization_duplicate_slug_raises_conflict(
    async_session: AsyncSession,
) -> None:
    service = OrganizationService(async_session)
    data1 = OrganizationCreate(name="Acme 1", slug="acme-corp")
    await service.create_organization(data1)

    data2 = OrganizationCreate(name="Acme 2", slug="acme-corp")
    with pytest.raises(ConflictError) as exc_info:
        await service.create_organization(data2)

    assert "Já existe uma organização cadastrada com o slug" in exc_info.value.message


@pytest.mark.asyncio
async def test_get_organization_by_id_success(async_session: AsyncSession) -> None:
    service = OrganizationService(async_session)
    org = await service.create_organization(OrganizationCreate(name="Tenant X", slug="tenant-x"))

    fetched = await service.get_organization_by_id(org.id)
    assert fetched.id == org.id
    assert fetched.slug == "tenant-x"


@pytest.mark.asyncio
async def test_get_organization_by_id_not_found(async_session: AsyncSession) -> None:
    service = OrganizationService(async_session)
    with pytest.raises(NotFoundError):
        await service.get_organization_by_id(uuid4())


@pytest.mark.asyncio
async def test_list_organizations_super_admin_and_tenant_isolation(
    async_session: AsyncSession,
) -> None:
    service = OrganizationService(async_session)
    org_a = await service.create_organization(
        OrganizationCreate(name="Org Alpha", slug="org-alpha")
    )
    await service.create_organization(OrganizationCreate(name="Org Beta", slug="org-beta"))

    # Super Admin visualiza todas
    items_admin, total_admin = await service.list_organizations(
        user_is_super_admin=True,
        user_role=UserRole.SUPER_ADMIN.value,
        user_org_id=None,
    )
    assert total_admin == 2
    assert len(items_admin) == 2

    # NOC Operator visualiza todas
    _, total_noc = await service.list_organizations(
        user_is_super_admin=False,
        user_role=UserRole.NOC_OPERATOR.value,
        user_org_id=None,
    )
    assert total_noc == 2

    # Client Viewer de Org Alpha visualiza apenas Org Alpha
    items_viewer, total_viewer = await service.list_organizations(
        user_is_super_admin=False,
        user_role=UserRole.CLIENT_VIEWER.value,
        user_org_id=str(org_a.id),
    )
    assert total_viewer == 1
    assert items_viewer[0].id == org_a.id

    # Usuário sem organization_id não visualiza nenhuma
    items_none, total_none = await service.list_organizations(
        user_is_super_admin=False,
        user_role=UserRole.CLIENT_VIEWER.value,
        user_org_id=None,
    )
    assert total_none == 0
    assert len(items_none) == 0
