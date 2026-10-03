from collections.abc import AsyncGenerator
from uuid import uuid4
import httpx
import pytest
from fastapi import status
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.main import app
from src.core.database.base_model import Base
from src.core.database.session import get_db_session
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.iam.security.tokens import create_access_token

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

@pytest.fixture
def override_get_db(test_session_factory: async_sessionmaker[AsyncSession]):
    async def _get_test_session():
        async with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = _get_test_session
    yield
    app.dependency_overrides.clear()

def generate_token(role: str, org_id: str) -> str:
    payload = {
        "sub": str(uuid4()),
        "email": "test@test.com",
        "role": role,
        "organization_id": org_id
    }
    return create_access_token(payload)

@pytest.mark.asyncio
async def test_create_and_list_device(override_get_db):
    org_id = str(uuid4())
    token = generate_token("ORG_ADMIN", org_id)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Create
        payload = {
            "name": "Router Test",
            "ip_address": "192.168.1.1",
            "port": 22,
            "protocol": "ssh",
            "category": "ROUTER"
        }
        resp = await client.post("/api/v1/devices/", json=payload, headers=headers)
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["name"] == "Router Test"
        assert data["ip_address"] == "192.168.1.1"
        device_id = data["id"]
        
        # List
        resp = await client.get("/api/v1/devices/", headers=headers)
        assert resp.status_code == status.HTTP_200_OK
        list_data = resp.json()
        assert list_data["total"] == 1
        assert list_data["items"][0]["name"] == "Router Test"
        
        # Detail
        resp = await client.get(f"/api/v1/devices/{device_id}", headers=headers)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["port"] == 22

@pytest.mark.asyncio
async def test_search_device(override_get_db):
    org_id = str(uuid4())
    token = generate_token("NOC_OPERATOR", org_id)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "name": "Switch Luanda",
            "ip_address": "10.0.0.1",
            "port": 22,
            "protocol": "ssh",
            "category": "SWITCH"
        }
        await client.post("/api/v1/devices/", json=payload, headers=headers)
        
        resp = await client.get("/api/v1/devices/search?q=Luanda", headers=headers)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["name"] == "Switch Luanda"
