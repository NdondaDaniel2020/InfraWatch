"""Testes de integração para endpoint e serviço de backup multi-destino (ADR-032 / Issue #220)."""

from uuid import uuid4

import httpx
import pytest
from fastapi import status

from src.contexts.iam.security.tokens import create_access_token
from src.contexts.system.schemas.backup import BackupTriggerRequest
from src.contexts.system.services.backup_service import BackupService
from src.main import app


def generate_token(role: str) -> str:
    """Gera JWT para testes simulando o RBAC do InfraWatch."""
    payload = {
        "sub": str(uuid4()),
        "email": f"{role.lower()}@infrawatch.io",
        "role": role,
        "organization_id": str(uuid4()),
    }
    return create_access_token(payload)


@pytest.mark.asyncio
async def test_backup_unauthorized_without_token():
    """Requisições sem cabeçalho Authorization devem ser rejeitadas com 401."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/api/v1/system/backup", json={})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["CLIENT_VIEWER", "ORG_ADMIN", "NOC_OPERATOR"])
async def test_backup_forbidden_for_non_super_admin(role: str):
    """Apenas SUPER_ADMIN pode disparar backup manual; outros papéis recebem 403."""
    token = generate_token(role)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/api/v1/system/backup", json={}, headers=headers)
        assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_backup_accepted_for_super_admin():
    """SUPER_ADMIN dispara backup com sucesso recebendo HTTP 202 Accepted imediatamente."""
    token = generate_token("SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        payload = {"skip_remote": True, "dry_run": True}
        resp = await client.post("/api/v1/system/backup", json=payload, headers=headers)

        assert resp.status_code == status.HTTP_202_ACCEPTED
        data = resp.json()
        assert data["status"] == "accepted"
        assert "task_id" in data
        assert data["task_id"].startswith("backup_")
        assert "started_at" in data

        # Consulta de status
        task_id = data["task_id"]
        status_resp = await client.get(f"/api/v1/system/backup/status/{task_id}", headers=headers)
        assert status_resp.status_code == status.HTTP_200_OK
        status_data = status_resp.json()
        assert status_data["task_id"] == task_id


@pytest.mark.asyncio
async def test_latest_backup_status_endpoint():
    """SUPER_ADMIN e NOC_OPERATOR podem consultar o status do backup mais recente."""
    admin_token = generate_token("SUPER_ADMIN")
    noc_token = generate_token("NOC_OPERATOR")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Dispara um backup para garantir registro em memória
        await client.post(
            "/api/v1/system/backup",
            json={"dry_run": True},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # NOC_OPERATOR pode consultar status
        resp = await client.get(
            "/api/v1/system/backup/status",
            headers={"Authorization": f"Bearer {noc_token}"},
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "task_id" in data
        assert data["status"] in ["accepted", "in_progress", "completed"]


@pytest.mark.asyncio
async def test_backup_service_direct_execution():
    """Testa diretamente a lógica do BackupService com dry-run e isolamento assíncrono."""
    service = BackupService()
    req = BackupTriggerRequest(skip_remote=True, dry_run=True)
    res = service.trigger_backup(req, user_id="admin-test-uuid")

    assert res.status == "accepted"
    assert res.task_id.startswith("backup_")

    status_rec = service.get_status(res.task_id)
    assert status_rec is not None
    assert status_rec.details["dry_run"] is True
    assert status_rec.details["skip_remote"] is True
