"""Testes de validação da infraestrutura do Gateway Nginx e Docker Compose (Issue #219)."""

from pathlib import Path
import yaml


def get_project_root() -> Path:
    """Retorna o diretório raiz do projeto."""
    return Path(__file__).resolve().parents[4]


def test_gateway_nginx_configuration_file_exists():
    """Valida se o arquivo de configuração do Gateway Nginx existe e tem conteúdo."""
    root = get_project_root()
    nginx_conf = root / "nginx" / "nginx.conf"

    assert nginx_conf.exists(), "O arquivo nginx/nginx.conf deve existir na raiz do projeto."
    content = nginx_conf.read_text(encoding="utf-8")
    assert len(content) > 100, "O arquivo nginx/nginx.conf não deve estar vazio."


def test_gateway_nginx_upstreams():
    """Garante que os upstreams para a API FastAPI e o container do Frontend estão definidos."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    assert "upstream infrawatch_api" in content
    assert "server infrawatch-api:8000;" in content
    assert "upstream infrawatch_frontend" in content
    assert "server infrawatch-frontend:80;" in content


def test_gateway_nginx_sse_streaming_directives():
    """Valida se o streaming SSE tem proxy_buffering off e timeouts estendidos contra buffering."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    # Bloco regex ou correspondência para rotas SSE
    assert "events/stream" in content
    assert "proxy_buffering off;" in content
    assert "proxy_cache off;" in content
    assert "chunked_transfer_encoding off;" in content
    assert "proxy_read_timeout 86400s;" in content
    assert "proxy_set_header X-Accel-Buffering no;" in content


def test_gateway_nginx_healthcheck_endpoint():
    """Valida se o endpoint /healthz para checagem rápida de saúde existe no gateway."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    assert "location = /healthz" in content
    assert "return 200" in content


def test_frontend_spa_fallback_configuration():
    """Valida se o servidor Nginx estático do frontend tem fallback SPA configurado."""
    root = get_project_root()
    frontend_conf = root / "frontend" / "nginx.conf"

    assert frontend_conf.exists(), "O arquivo frontend/nginx.conf deve existir."
    content = frontend_conf.read_text(encoding="utf-8")

    assert "try_files $uri $uri/ /index.html;" in content
    assert "location = /healthz" in content


def test_frontend_dockerfile_multi_stage():
    """Valida se o Dockerfile do frontend implementa multi-stage build com Node e Nginx."""
    root = get_project_root()
    dockerfile = root / "frontend" / "Dockerfile"

    assert dockerfile.exists(), "frontend/Dockerfile deve existir."
    content = dockerfile.read_text(encoding="utf-8")

    assert "FROM node:20-alpine AS builder" in content
    assert "npm run build" in content
    assert "FROM nginx:1.27-alpine" in content
    assert "COPY --from=builder /app/dist /usr/share/nginx/html" in content
    assert "HEALTHCHECK" in content


def test_docker_compose_services():
    """Valida se infrawatch-frontend e infrawatch-gateway estão integrados ao docker-compose.yml."""
    root = get_project_root()
    compose_path = root / "docker-compose.yml"

    assert compose_path.exists(), "docker-compose.yml deve existir."
    with open(compose_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    services = data.get("services", {})
    assert "infrawatch-frontend" in services
    assert "infrawatch-gateway" in services

    gateway = services["infrawatch-gateway"]
    assert "80:80" in gateway.get("ports", [])
    assert "infrawatch-net" in gateway.get("networks", [])

    frontend = services["infrawatch-frontend"]
    assert "infrawatch-net" in frontend.get("networks", [])
    assert frontend.get("healthcheck") is not None
