from collections.abc import AsyncGenerator
import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from uuid import uuid4

from src.core.database.base_model import Base
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.inventory.services.device_query_service import DeviceQueryService
from src.contexts.inventory.schemas.filters import DeviceFilters
from src.core.web.pagination import PaginationParams

@pytest.fixture
async def test_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    
    from sqlalchemy import event
    @event.listens_for(engine.sync_engine, "connect")
    def receive_connect(dbapi_connection, connection_record):
        dbapi_connection.create_function("to_tsvector", 2, lambda lang, text: text, deterministic=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_query_service_integration(test_session_factory: async_sessionmaker[AsyncSession]):
    org_id = uuid4()
    
    # Preencher DB
    async with test_session_factory() as session, session.begin():
        device1 = DeviceModel(
            id=uuid4(),
            organization_id=org_id,
            name="Router Benguela",
            hostname="rb-01",
            ip_address="10.1.0.1",
            port=22,
            protocol="ssh",
            category="ROUTER",
            interval_seconds=60,
            status="UP",
        )
        device2 = DeviceModel(
            id=uuid4(),
            organization_id=org_id,
            name="Switch Core Luanda",
            hostname="sw-core",
            ip_address="10.2.0.1",
            port=22,
            protocol="ssh",
            category="SWITCH",
            interval_seconds=60,
            status="DOWN",
        )
        session.add_all([device1, device2])
        
    async with test_session_factory() as session:
        service = DeviceQueryService(session)
        
        # Test 1: list_devices com filtros
        filters = DeviceFilters(status="UP", category=None, protocol=None, is_paused=None)
        pagination = PaginationParams(page=1, page_size=10)
        
        resp = await service.list_devices(org_id, filters, pagination)
        assert resp.total == 1
        assert resp.items[0].name == "Router Benguela"
        
        # Test 2: search_devices
        resp = await service.search_devices(org_id, "Luanda", pagination)
        assert resp.total == 1
        assert resp.items[0].name == "Switch Core Luanda"
        
        # Test 3: is_viewer masking
        resp = await service.list_devices(org_id, DeviceFilters(), pagination, is_viewer=True)
        assert resp.total == 2
        for item in resp.items:
            assert "***" in item.ip_address
            
        # Test 4: get_device_detail
        detail = await service.get_device_detail(org_id, device1.id)
        assert detail is not None
        assert detail.name == "Router Benguela"
        
        # Test 5: get_device_detail is_viewer
        detail_viewer = await service.get_device_detail(org_id, device1.id, is_viewer=True)
        assert "***" in detail_viewer.ip_address
        assert detail_viewer.port == 0
