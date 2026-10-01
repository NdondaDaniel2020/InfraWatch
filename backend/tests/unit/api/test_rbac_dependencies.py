"""Testes unitários para RBAC, Isolamento Multi-tenant e Sanitização de Topologia (ADR-012 / Issue #13).

Valida os critérios de aceite:
1. Usuário CLIENT_VIEWER recebe HTTP 403 Forbidden ao tentar invocar rotas operacionais do NOC.
2. Usuário CLIENT_VIEWER da Org A não consegue acessar dados da Org B (isolamento multi-tenant).
3. SUPER_ADMIN e NOC_OPERATOR possuem acesso global cross-tenant.
4. Resposta JSON para CLIENT_VIEWER mascara endereços de IP privados de gerência e segredos de rede.
"""

from uuid import uuid4

import httpx
import pytest
from fastapi import Depends, FastAPI

from src.api.dependencies.rbac import (
    CurrentUserDep,
    enforce_tenant_scope,
    require_roles,
)
from src.contexts.identity.domain.enums import UserRole
from src.contexts.identity.services.sanitizer import (
    MASKED_IP,
    MASKED_SECRET,
    TopologySanitizer,
)
from src.core.security.tokens import create_access_token


def create_rbac_test_app() -> FastAPI:
    """Cria uma aplicação FastAPI de teste com endpoints de diferentes níveis de privilégio."""
    app = FastAPI()

    # Rota restrita ao NOC (Operação e Super Admin)
    @app.get(
        "/api/noc/incident-management",
        dependencies=[Depends(require_roles(UserRole.NOC_OPERATOR, UserRole.SUPER_ADMIN))],
    )
    async def noc_operations(user: CurrentUserDep) -> dict[str, str]:
        return {"status": "ok", "user": user.email, "role": user.role}

    # Rota restrita ao Administrador do Cliente (Org Admin) e Super Admin
    @app.get(
        "/api/org/users",
        dependencies=[Depends(require_roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN))],
    )
    async def org_admin_route(user: CurrentUserDep) -> dict[str, str]:
        return {"status": "ok", "org_id": str(user.organization_id)}

    # Rota com verificação explícita de Tenant Scope
    @app.get("/api/organizations/{org_id}/devices")
    async def get_org_devices(
        org_id: str,
        user: CurrentUserDep,
    ) -> dict[str, str]:
        scoped_org = enforce_tenant_scope(org_id, user)
        return {"status": "ok", "scoped_org": str(scoped_org)}

    # Rota com sanitização de topologia sensível
    @app.get("/api/devices/{device_id}")
    async def get_device_details(
        device_id: str,
        user: CurrentUserDep,
    ) -> dict[str, str | None]:
        raw_device = {
            "id": device_id,
            "hostname": "Core-Switch-Luanda",
            "management_ip": "10.200.1.50",
            "public_ip": "197.234.10.2",
            "snmp_community": "c0re_pr1v_str1ng",
            "router_internal_id": "rt-ang-core-01",
        }
        sanitized = TopologySanitizer.sanitize_for_user(raw_device, user)
        return sanitized

    return app


@pytest.fixture
def rbac_app() -> FastAPI:
    return create_rbac_test_app()


def make_token(
    user_id: str,
    email: str,
    role: UserRole | str,
    organization_id: str | None = None,
) -> str:
    """Gera um token JWT válido para teste."""
    return create_access_token(
        data={
            "sub": user_id,
            "email": email,
            "role": role.value if isinstance(role, UserRole) else str(role),
            "organization_id": organization_id,
        }
    )


@pytest.mark.asyncio
async def test_client_viewer_forbidden_from_noc_routes(rbac_app: FastAPI) -> None:
    """Critério 1: Usuário CLIENT_VIEWER recebe HTTP 403 Forbidden ao tentar invocar rotas do NOC."""
    token = make_token(
        user_id=str(uuid4()),
        email="viewer@banco.ao",
        role=UserRole.CLIENT_VIEWER,
        organization_id="org-bai",
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rbac_app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(
            "/api/noc/incident-management",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 403
    assert "Acesso negado" in response.json()["detail"]


@pytest.mark.asyncio
async def test_noc_operator_and_super_admin_allowed_on_noc_routes(rbac_app: FastAPI) -> None:
    """Garante que NOC_OPERATOR e SUPER_ADMIN acessam rotas operacionais normalmente."""
    token_noc = make_token(
        user_id=str(uuid4()),
        email="operator@rcs.ao",
        role=UserRole.NOC_OPERATOR,
    )
    token_admin = make_token(
        user_id=str(uuid4()),
        email="admin@rcs.ao",
        role=UserRole.SUPER_ADMIN,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rbac_app),
        base_url="http://testserver",
    ) as client:
        # 1. NOC Operator
        res1 = await client.get(
            "/api/noc/incident-management",
            headers={"Authorization": f"Bearer {token_noc}"},
        )
        assert res1.status_code == 200
        assert res1.json()["role"] == UserRole.NOC_OPERATOR

        # 2. Super Admin
        res2 = await client.get(
            "/api/noc/incident-management",
            headers={"Authorization": f"Bearer {token_admin}"},
        )
        assert res2.status_code == 200
        assert res2.json()["role"] == UserRole.SUPER_ADMIN


@pytest.mark.asyncio
async def test_client_viewer_cannot_access_other_tenant(rbac_app: FastAPI) -> None:
    """Critério 2: Usuário CLIENT_VIEWER da Org A não consegue acessar dados da Org B."""
    org_a = "org-banco-a"
    org_b = "org-banco-b"

    token_org_a = make_token(
        user_id=str(uuid4()),
        email="analista@bancoa.ao",
        role=UserRole.CLIENT_VIEWER,
        organization_id=org_a,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rbac_app),
        base_url="http://testserver",
    ) as client:
        # Acesso aos dados da própria organização (Org A) -> 200 OK
        res_own = await client.get(
            f"/api/organizations/{org_a}/devices",
            headers={"Authorization": f"Bearer {token_org_a}"},
        )
        assert res_own.status_code == 200
        assert res_own.json()["scoped_org"] == org_a

        # Tentativa de acesso cruzado aos dados da Org B -> 403 Forbidden
        res_cross = await client.get(
            f"/api/organizations/{org_b}/devices",
            headers={"Authorization": f"Bearer {token_org_a}"},
        )
        assert res_cross.status_code == 403
        assert "Acesso negado: você não tem permissão" in res_cross.json()["detail"]


@pytest.mark.asyncio
async def test_super_admin_and_noc_operator_cross_tenant_access(rbac_app: FastAPI) -> None:
    """Garante que equipes globais do NOC da RCS possuem visão cross-tenant."""
    target_org = "org-qualquer-cliente"
    token_noc = make_token(
        user_id=str(uuid4()),
        email="noc@rcs.ao",
        role=UserRole.NOC_OPERATOR,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rbac_app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(
            f"/api/organizations/{target_org}/devices",
            headers={"Authorization": f"Bearer {token_noc}"},
        )

    assert response.status_code == 200
    assert response.json()["scoped_org"] == target_org


@pytest.mark.asyncio
async def test_topology_sanitization_for_client_viewer(rbac_app: FastAPI) -> None:
    """Critério 3: Resposta JSON para CLIENT_VIEWER mascara endereços IP privados de gerência e credenciais SNMP."""
    token_viewer = make_token(
        user_id=str(uuid4()),
        email="cliente@bai.ao",
        role=UserRole.CLIENT_VIEWER,
        organization_id="org-bai",
    )
    token_noc = make_token(
        user_id=str(uuid4()),
        email="noc@rcs.ao",
        role=UserRole.NOC_OPERATOR,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rbac_app),
        base_url="http://testserver",
    ) as client:
        # 1. Visão sanitizada para CLIENT_VIEWER
        res_viewer = await client.get(
            "/api/devices/dev-01",
            headers={"Authorization": f"Bearer {token_viewer}"},
        )
        assert res_viewer.status_code == 200
        data_viewer = res_viewer.json()

        # IP de gerência privado e segredos DEVEM estar mascarados
        assert data_viewer["management_ip"] == MASKED_IP
        assert data_viewer["snmp_community"] == MASKED_SECRET
        assert data_viewer["router_internal_id"] == MASKED_SECRET
        # IP público pode ser exibido
        assert data_viewer["public_ip"] == "197.234.10.2"

        # 2. Visão técnica completa para NOC_OPERATOR
        res_noc = await client.get(
            "/api/devices/dev-01",
            headers={"Authorization": f"Bearer {token_noc}"},
        )
        assert res_noc.status_code == 200
        data_noc = res_noc.json()

        # NOC Operator visualiza dados originais sem mascaramento
        assert data_noc["management_ip"] == "10.200.1.50"
        assert data_noc["snmp_community"] == "c0re_pr1v_str1ng"
        assert data_noc["router_internal_id"] == "rt-ang-core-01"


@pytest.mark.asyncio
async def test_authentication_errors(rbac_app: FastAPI) -> None:
    """Valida rejeição de requisições sem token ou com tokens corrompidos."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rbac_app),
        base_url="http://testserver",
    ) as client:
        # Sem cabeçalho Authorization
        r1 = await client.get("/api/noc/incident-management")
        assert r1.status_code == 401

        # Cabeçalho sem formato Bearer
        r2 = await client.get(
            "/api/noc/incident-management",
            headers={"Authorization": "Basic 12345"},
        )
        assert r2.status_code == 401

        # Token adulterado
        r3 = await client.get(
            "/api/noc/incident-management",
            headers={"Authorization": "Bearer invalid.token.payload"},
        )
        assert r3.status_code == 401
