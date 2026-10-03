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
async def test_client_viewer_cannot_create(override_get_db):
    org_id = str(uuid4())
    token = generate_token("CLIENT_VIEWER", org_id)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "name": "Router Test",
            "ip_address": "192.168.1.1",
            "port": 22,
            "protocol": "ssh",
            "category": "ROUTER"
        }
        resp = await client.post("/api/v1/devices/", json=payload, headers=headers)
        assert resp.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_client_viewer_sees_masked_ip(override_get_db):
    org_id = str(uuid4())
    admin_token = generate_token("ORG_ADMIN", org_id)
    viewer_token = generate_token("CLIENT_VIEWER", org_id)
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "name": "Router Test",
            "ip_address": "192.168.1.1",
            "port": 22,
            "protocol": "ssh",
            "category": "ROUTER"
        }
        resp = await client.post("/api/v1/devices/", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
        device_id = resp.json()["id"]
        
        # Viewer Request
        resp_viewer = await client.get(f"/api/v1/devices/{device_id}", headers={"Authorization": f"Bearer {viewer_token}"})
        data = resp_viewer.json()
        assert data["ip_address"] == "***.***.1.1"
        assert data["port"] == 0

@pytest.mark.asyncio
async def test_org_admin_isolation(override_get_db):
    org1 = str(uuid4())
    org2 = str(uuid4())
    
    admin1 = generate_token("ORG_ADMIN", org1)
    admin2 = generate_token("ORG_ADMIN", org2)
    
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "name": "Router Org 1",
            "ip_address": "192.168.1.1",
            "port": 22,
            "protocol": "ssh",
            "category": "ROUTER"
        }
        resp = await client.post("/api/v1/devices/", json=payload, headers={"Authorization": f"Bearer {admin1}"})
        device_id = resp.json()["id"]
        
        # Admin 2 tenta buscar dispositivo da Org 1 passando explicitly org_id
        resp2 = await client.get(f"/api/v1/devices/{device_id}?org_id={org1}", headers={"Authorization": f"Bearer {admin2}"})
        assert resp2.status_code == status.HTTP_403_FORBIDDEN
