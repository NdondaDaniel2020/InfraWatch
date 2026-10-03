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
from src.contexts.inventory.repositories.device_repository import DeviceRepository

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
async def test_full_text_search_fallback(test_session_factory: async_sessionmaker[AsyncSession]):
    """Teste de integração validando busca parcial de dispositivos."""
    
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
        )
        
        session.add_all([device1, device2])
        
    async with test_session_factory() as session:
        repo = DeviceRepository(session)
        
        # Test 1: Busca pelo nome
        results = await repo.search_devices("Benguela", org_id)
        assert len(results) == 1
        assert results[0].name == "Router Benguela"
        
        # Test 2: Busca por IP
        results = await repo.search_devices("10.2.0.1", org_id)
        assert len(results) == 1
        assert results[0].name == "Switch Core Luanda"
        
        # Test 3: Organização errada não retorna
        results = await repo.search_devices("Benguela", uuid4())
        assert len(results) == 0
