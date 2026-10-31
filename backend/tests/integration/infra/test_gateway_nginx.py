"""Testes de validação da infraestrutura do Gateway Nginx, TLS HTTPS e Docker Compose (Issue #270)."""

import os
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


def test_gateway_nginx_api_upstream():
    """Garante que o upstream para a API FastAPI está definido."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    assert "upstream infrawatch_api" in content
    assert "server infrawatch-api:8000;" in content


def test_gateway_nginx_tls_termination_and_redirect():
    """Valida terminação TLS/HTTPS na porta 443, domínio infrawatch.42.fr e redirecionamento 301 na porta 80."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    # Domínio canônico da 42 Luanda
    assert "infrawatch.42.fr" in content

    # Bloco HTTPS na porta 443
    assert "listen 443 ssl" in content or "443 ssl http2" in content
    assert "ssl_certificate /etc/nginx/certs/fullchain.pem;" in content
    assert "ssl_certificate_key /etc/nginx/certs/privkey.pem;" in content
    assert "TLSv1.2 TLSv1.3" in content
    assert "Strict-Transport-Security" in content

    # Bloco HTTP na porta 80 com redirecionamento 301 e rota ACME
    assert "return 301 https://$host$request_uri;" in content
    assert "location /.well-known/acme-challenge/" in content
    assert "/var/www/certbot" in content


def test_gateway_nginx_direct_spa_serving():
    """Valida se o Gateway entrega diretamente os arquivos estáticos da SPA com fallback e cache longo (Issue #270)."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    assert "root /usr/share/nginx/html;" in content
    assert "try_files $uri $uri/ /index.html;" in content
    assert "location ~* \\.(?:css|js|woff2?|eot|ttf|otf|png|jpg|jpeg|gif|ico|svg)$" in content


def test_gateway_nginx_sse_streaming_directives():
    """Valida se o streaming SSE tem proxy_buffering off e timeouts estendidos contra buffering."""
    root = get_project_root()
    content = (root / "nginx" / "nginx.conf").read_text(encoding="utf-8")

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


def test_init_certs_script():
    """Valida se o script de geração de certificados autoassinados existe, é executável e aponta para infrawatch.42.fr."""
    root = get_project_root()
    script = root / "scripts" / "init-certs.sh"

    assert script.exists(), "scripts/init-certs.sh deve existir."
    assert os.access(script, os.X_OK), "scripts/init-certs.sh deve ter permissão de execução."
    content = script.read_text(encoding="utf-8")
    assert "CN=infrawatch.42.fr" in content
    assert "DNS:infrawatch.42.fr" in content
    assert "fullchain.pem" in content
    assert "privkey.pem" in content


def test_docker_compose_services():
    """Valida se infrawatch-gateway, infrawatch-frontend e daemons de workers estão integrados no Compose com hardening de rede."""
    root = get_project_root()
    compose_path = root / "docker-compose.yml"

    assert compose_path.exists(), "docker-compose.yml deve existir."
    with open(compose_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    services = data.get("services", {})
    assert "infrawatch-frontend" in services
    assert "infrawatch-gateway" in services
    assert "infrawatch-api" in services
    assert "infrawatch-cleanup-worker" in services, (
        "infrawatch-cleanup-worker deve estar presente no compose."
    )

    gateway = services["infrawatch-gateway"]
    ports = gateway.get("ports", [])
    assert "80:80" in ports
    assert "443:443" in ports
    assert "infrawatch-net" in gateway.get("networks", [])

    # Valida isolamento de rede da API FastAPI (sem porta pública mapeada no host)
    api = services["infrawatch-api"]
    api_ports = api.get("ports", [])
    assert "8000:8000" not in api_ports, (
        "A porta 8000 da API não deve estar exposta publicamente no host."
    )

    # Valida volumes essenciais
    volumes = data.get("volumes", {})
    assert "frontend_dist" in volumes
    assert "certbot_acme" in volumes


def test_makefile_targets():
    """Valida se o Makefile possui alvos para certs, certs-clean, gateway-reload e vinculação no up."""
    root = get_project_root()
    makefile = root / "Makefile"

    assert makefile.exists(), "Makefile deve existir."
    content = makefile.read_text(encoding="utf-8")

    assert "certs:" in content
    assert "certs-clean:" in content
    assert "gateway-reload:" in content
    assert "up: secrets-init certs" in content
