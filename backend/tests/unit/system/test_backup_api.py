"""Testes unitários de autorização e rotas REST para Backup e Disaster Recovery (ADR-032)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI, status

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.tokens import create_access_token
from src.contexts.system.api.routes.backup import router as backup_router
from src.contexts.system.schemas.backup import (
    BackupHistoryItem,
    BackupHistoryResponse,
    BackupTriggerResponse,
)


@pytest.fixture
def backup_test_app() -> FastAPI:
    """Cria uma aplicação FastAPI isolada com o roteador de backup registrado."""
    app = FastAPI()
    app.include_router(backup_router)
    return app


@pytest.fixture
def admin_token() -> str:
    """Gera um JWT válido com privilégio SUPER_ADMIN."""
    return create_access_token(
        user_id="usr-admin-1",
        role=UserRole.SUPER_ADMIN.value,
        extra_claims={"email": "noc-admin@rcsangola.co.ao"},
    )


@pytest.fixture
def client_viewer_token() -> str:
    """Gera um JWT válido com papel restrito CLIENT_VIEWER."""
    return create_access_token(
        user_id="usr-client-2",
        role=UserRole.CLIENT_VIEWER.value,
        extra_claims={"email": "viewer@cliente.ao"},
    )


@pytest.mark.asyncio
async def test_trigger_backup_requires_authentication(backup_test_app: FastAPI) -> None:
    """Garante que requisição não autenticada receba HTTP 401 Unauthorized."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=backup_test_app),
        base_url="http://test",
    ) as client:
        response = await client.post("/api/v1/system/backup")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_trigger_backup_forbidden_for_non_admin(
    backup_test_app: FastAPI,
    client_viewer_token: str,
) -> None:
    """Garante que usuário CLIENT_VIEWER receba HTTP 403 Forbidden ao tentar disparar backup."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=backup_test_app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/system/backup",
            headers={"Authorization": f"Bearer {client_viewer_token}"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Acesso negado" in response.json()["detail"]


@pytest.mark.asyncio
async def test_trigger_backup_accepted_for_admin(
    backup_test_app: FastAPI,
    admin_token: str,
) -> None:
    """Garante que SUPER_ADMIN consiga disparar backup recebendo HTTP 202 Accepted imediatamente."""
    mock_response = BackupTriggerResponse(
        backup_id="bck_test123",
        status="accepted",
        message="Rotina de backup despachada para o contêiner isolado.",
        sse_url="/api/v1/system/backup/events",
    )

    with patch(
        "src.contexts.system.api.routes.backup.BackupService.trigger_backup",
        new=AsyncMock(return_value=mock_response),
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=backup_test_app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/system/backup",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"notes": "Backup pré-upgrade"},
            )
            assert response.status_code == status.HTTP_202_ACCEPTED
            data = response.json()
            assert data["backup_id"] == "bck_test123"
            assert data["status"] == "accepted"


@pytest.mark.asyncio
async def test_list_backup_history_rbac(
    backup_test_app: FastAPI,
    admin_token: str,
    client_viewer_token: str,
) -> None:
    """Valida que o histórico de backups seja restrito ao administrador."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=backup_test_app),
        base_url="http://test",
    ) as client:
        # 1. Acesso negado para CLIENT_VIEWER
        resp_viewer = await client.get(
            "/api/v1/system/backup/history",
            headers={"Authorization": f"Bearer {client_viewer_token}"},
        )
        assert resp_viewer.status_code == status.HTTP_403_FORBIDDEN

        # 2. Sucesso para SUPER_ADMIN
        mock_history = BackupHistoryResponse(
            items=[
                BackupHistoryItem(
                    filename="infrawatch_backup_20261017_020000.tar.gz",
                    size_bytes=1048576,
                    size_human="1.0 MB",
                    created_at="2026-10-17T02:00:00Z",
                    sha256="abc1234567890",
                    storage_path="/var/backups/infrawatch/infrawatch_backup_20261017_020000.tar.gz",
                )
            ],
            total=1,
        )

        with patch(
            "src.contexts.system.api.routes.backup.BackupService.get_backup_history",
            new=AsyncMock(return_value=mock_history),
        ):
            resp_admin = await client.get(
                "/api/v1/system/backup/history",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp_admin.status_code == status.HTTP_200_OK
            data = resp_admin.json()
            assert data["total"] == 1
            assert data["items"][0]["filename"] == "infrawatch_backup_20261017_020000.tar.gz"


@pytest.mark.asyncio
async def test_gdrive_status_api(
    backup_test_app: FastAPI,
    admin_token: str,
    client_viewer_token: str,
) -> None:
    """Valida endpoint /gdrive/status para admin e bloqueio para não-admin."""
    from src.contexts.system.schemas.backup import GDriveStatusResponse

    mock_status = GDriveStatusResponse(
        configured=True, authorized=False, message="Aguardando autorização"
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=backup_test_app),
        base_url="http://test",
    ) as client:
        # 1. 403 para não-admin
        resp_forbidden = await client.get(
            "/api/v1/system/backup/gdrive/status",
            headers={"Authorization": f"Bearer {client_viewer_token}"},
        )
        assert resp_forbidden.status_code == status.HTTP_403_FORBIDDEN

        # 2. 200 para admin
        with patch(
            "src.contexts.system.api.routes.backup.BackupService.get_gdrive_status",
            return_value=mock_status,
        ):
            resp = await client.get(
                "/api/v1/system/backup/gdrive/status",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert data["configured"] is True
            assert data["authorized"] is False


@pytest.mark.asyncio
async def test_gdrive_auth_url_api(
    backup_test_app: FastAPI,
    admin_token: str,
) -> None:
    """Valida endpoint /gdrive/auth-url gerando link OAuth."""
    from src.contexts.system.schemas.backup import GDriveAuthUrlResponse

    mock_auth = GDriveAuthUrlResponse(
        auth_url="https://accounts.google.com/o/oauth2/v2/auth?client_id=123",
        state="gdrive_backup",
    )

    with patch(
        "src.contexts.system.api.routes.backup.BackupService.get_gdrive_auth_url",
        return_value=mock_auth,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=backup_test_app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/v1/system/backup/gdrive/auth-url?redirect_uri=https://localhost/auth/callback",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert "accounts.google.com" in data["auth_url"]
            assert data["state"] == "gdrive_backup"


@pytest.mark.asyncio
async def test_gdrive_callback_api(
    backup_test_app: FastAPI,
    admin_token: str,
) -> None:
    """Valida endpoint POST /gdrive/callback salvando credenciais."""
    from src.contexts.system.schemas.backup import GDriveStatusResponse

    mock_resp = GDriveStatusResponse(
        configured=True, authorized=True, message="Conectado com sucesso"
    )

    with patch(
        "src.contexts.system.api.routes.backup.BackupService.complete_gdrive_auth",
        new=AsyncMock(return_value=mock_resp),
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=backup_test_app),
            base_url="http://test",
        ) as client:
            resp = await client.post(
                "/api/v1/system/backup/gdrive/callback",
                json={"code": "auth-code-123", "redirect_uri": "https://localhost/auth/callback"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert data["configured"] is True
            assert data["authorized"] is True


@pytest.mark.asyncio
async def test_get_backup_storage_success(
    backup_test_app: FastAPI,
    admin_token: str,
) -> None:
    """Valida retorno do endpoint /storage com capacidades e métricas dos 3 destinos."""
    from src.contexts.system.schemas.backup import (
        BackupStorageResponse,
        StorageDestinationGDrive,
        StorageDestinationLocal,
        StorageDestinationR2,
    )

    mock_resp = BackupStorageResponse(
        local=StorageDestinationLocal(
            status="ONLINE & SINCRONIZADO",
            path="/var/backups/infrawatch",
            total_bytes=35651584000,
            used_bytes=26306560000,
            free_bytes=7515024000,
            total_human="33.2 GB",
            used_human="24.5 GB",
            free_human="7.0 GB",
            used_percent=73.8,
        ),
        gdrive=StorageDestinationGDrive(
            status="CONECTADO (OAUTH2)",
            configured=True,
            authorized=True,
            email="ndondadaniel2020@gmail.com",
            total_human="5.0 TB",
            used_human="8.7 GB",
            free_human="4.99 TB",
            used_percent=0.2,
        ),
        r2=StorageDestinationR2(
            status="ATIVO (ZERO EGRESS)",
            configured=True,
            bucket="infrawatch-backup-luanda-dr",
            total_human="10 GB",
            used_human="6.4 GB",
            free_human="3.6 GB",
            used_percent=64.0,
        ),
    )

    with patch(
        "src.contexts.system.api.routes.backup.BackupService.get_storage_status",
        new=AsyncMock(return_value=mock_resp),
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=backup_test_app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/v1/system/backup/storage",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert data["local"]["total_human"] == "33.2 GB"
            assert data["local"]["used_percent"] == 73.8
            assert data["gdrive"]["email"] == "ndondadaniel2020@gmail.com"
            assert data["r2"]["bucket"] == "infrawatch-backup-luanda-dr"
