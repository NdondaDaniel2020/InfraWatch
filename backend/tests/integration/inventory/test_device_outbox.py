from collections.abc import AsyncGenerator
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from uuid import uuid4

from src.core.database.base_model import Base
from src.core.database.models.outbox import OutboxEventModel, OutboxStatus
from src.contexts.inventory.domain.commands import CreateDeviceCommand
from src.contexts.inventory.services.device_command_service import DeviceCommandService

# We need a mock repository and a concrete session for testing Outbox insertion
from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.repositories.device_repository import DeviceRepository

class DummyDeviceRepository(DeviceRepository):
    async def save(self, device: Device) -> None:
        pass

    async def find_by_id(self, device_id):
        return None

    async def find_by_organization(self, organization_id):
        return []


@pytest.fixture
async def test_session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

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
async def test_device_creation_generates_outbox_event(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Garante que a criação de dispositivo insere o evento no outbox na mesma transação."""
    async with test_session_factory() as session:
        repo = DummyDeviceRepository(session)
        service = DeviceCommandService(session, repo)
        
        # Ignora auditoria (mock)
        class MockAudit:
            async def record_action(self, **kwargs): pass
        service.audit_service = MockAudit()

        cmd = CreateDeviceCommand(
            organization_id=uuid4(),
            name="Core Router",
            ip_address="10.1.1.1",
            port=22,
            protocol="ssh",
            category="ROUTER",
            interval_seconds=60,
            thresholds={}
        )

        device = await service.create_device(cmd, actor_user_id=uuid4(), actor_ip="127.0.0.1")

    # Verifica o DB usando uma nova sessão (pois a anterior fez commit)
    async with test_session_factory() as session:
        result = await session.execute(
            select(OutboxEventModel).where(OutboxEventModel.aggregate_id == device.id)
        )
        outbox_entries = result.scalars().all()
        
        assert len(outbox_entries) == 1
        entry = outbox_entries[0]
        assert entry.event_type == "DeviceCreated"
        assert entry.status == OutboxStatus.PENDING
        assert entry.payload["name"] == "Core Router"
        assert entry.payload["ip_address"] == "10.1.1.1"
