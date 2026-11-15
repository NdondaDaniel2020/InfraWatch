#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Script de Bootstrap Automático de Integrações (GLPI & Zabbix)
# Configura tokens e permissões diretamente nos bancos e containers
# sem necessidade de intervenção manual via interface web.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

TARGET="${1:-all}"

bootstrap_glpi() {
    echo -e "${BLUE}=== [GLPI] Iniciando Bootstrap de API e Permissões ===${NC}"

    local container_db="infrawatch-glpi-db"
    local container_app="infrawatch-glpi-app"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container_db}$"; then
        echo -e "${YELLOW}[GLPI] Container ${container_db} não está em execução. Ignorando.${NC}"
        return 0
    fi

    local app_token
    local user_token
    local db_password

    app_token="$(cat "${SECRETS_DIR}/glpi_app_token.txt" 2>/dev/null || echo "infrawatch_app_token_secret_2026")"
    user_token="$(cat "${SECRETS_DIR}/glpi_user_token.txt" 2>/dev/null || echo "infrawatch_user_token_secret_2026")"
    db_password="$(cat "${SECRETS_DIR}/glpi_db_password.txt" 2>/dev/null || echo "glpi_secure_password_2026")"

    echo -e "[GLPI] Aguardando prontidão do MariaDB (${container_db})..."
    local retries=30
    until docker exec "${container_db}" mariadb-admin ping -u glpi -p"${db_password}" --silent &>/dev/null || [ "$retries" -eq 0 ]; do
        sleep 2
        retries=$((retries - 1))
    done

    if [ "$retries" -eq 0 ]; then
        echo -e "${RED}[GLPI] MariaDB não respondeu a tempo.${NC}"
        return 1
    fi

    # Verificar se as tabelas do GLPI existem
    local table_count
    table_count=$(docker exec "${container_db}" mariadb -u glpi -p"${db_password}" glpidb -sN -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='glpidb' AND table_name='glpi_configs';" 2>/dev/null || echo "0")
    if [ "$table_count" -eq 0 ]; then
        echo -e "[GLPI] Tabelas não encontradas. Executando database:install no container ${container_app}..."
        docker exec "${container_app}" php /var/www/html/glpi/bin/console database:install \
            --db-host=glpi-db --db-port=3306 --db-name=glpidb --db-user=glpi --db-password="${db_password}" \
            --force --reconfigure --no-telemetry --no-interaction 2>/dev/null || true
    fi

    # Garantir que o config_db.php existe no container da aplicação
    if docker ps --format '{{.Names}}' | grep -q "^${container_app}$"; then
        if ! docker exec "${container_app}" test -f /var/www/html/glpi/config/config_db.php; then
            echo -e "[GLPI] config_db.php ausente. Configurando conexão com o banco de dados..."
            docker exec "${container_app}" php /var/www/html/glpi/bin/console database:configure \
                --db-host=glpi-db --db-port=3306 --db-name=glpidb --db-user=glpi --db-password="${db_password}" \
                --reconfigure --no-interaction 2>/dev/null || true
        fi
        docker exec "${container_app}" chown -R www-data:www-data /var/www/html/glpi/config /var/www/html/glpi/files 2>/dev/null || true
    fi

    echo -e "[GLPI] Habilitando API REST e login por token externo..."
    docker exec "${container_db}" mariadb -u glpi -p"${db_password}" glpidb -e "
        UPDATE glpi_configs SET value = '1' WHERE name IN ('enable_api', 'enable_rest_api', 'enable_api_login_external_token');
        DELETE FROM glpi_apiclients WHERE name = 'InfraWatch API';
        INSERT INTO glpi_apiclients (name, is_active, ipv4_range_start, ipv4_range_end, ipv6, app_token)
        VALUES ('InfraWatch API', 1, NULL, NULL, NULL, '${app_token}');
        UPDATE glpi_users SET api_token = '${user_token}' WHERE name = 'glpi';
    "
    echo -e "${GREEN}[GLPI] Tokens sincronizados no MariaDB.${NC}"

    if docker ps --format '{{.Names}}' | grep -q "^${container_app}$"; then
        # Validação de conexão interna
        local status_code
        status_code=$(docker exec "${container_app}" curl -s -o /dev/null -w "%{http_code}" -H "App-Token: ${app_token}" -H "Authorization: user_token ${user_token}" "http://localhost/apirest.php/initSession" 2>/dev/null || echo "000")
        if [ "$status_code" = "200" ]; then
            echo -e "${GREEN}[GLPI] Validação de API REST: OK (HTTP 200 - initSession bem-sucedido)${NC}"
        else
            echo -e "${YELLOW}[GLPI] Validação de initSession retornou HTTP ${status_code}.${NC}"
        fi
    fi
}

bootstrap_zabbix() {
    echo -e "${BLUE}=== [Zabbix] Iniciando Bootstrap de API Token ===${NC}"

    local container_db="infrawatch-zabbix-db"
    local container_web="infrawatch-zabbix-web"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container_db}$"; then
        echo -e "${YELLOW}[Zabbix] Container ${container_db} não está em execução. Ignorando.${NC}"
        return 0
    fi

    local api_token
    api_token="$(cat "${SECRETS_DIR}/zabbix_api_token.txt" 2>/dev/null || echo "")"
    if [ -z "$api_token" ] || [ "${#api_token}" -ne 64 ]; then
        echo -e "${YELLOW}[Zabbix] Gerando novo token hex de 64 caracteres em secrets/zabbix_api_token.txt...${NC}"
        api_token="$(openssl rand -hex 32)"
        echo -n "${api_token}" > "${SECRETS_DIR}/zabbix_api_token.txt"
        chmod 600 "${SECRETS_DIR}/zabbix_api_token.txt"
    fi

    echo -e "[Zabbix] Aguardando prontidão do PostgreSQL (${container_db})..."
    local retries=30
    until docker exec "${container_db}" pg_isready -U zabbix -d zabbix &>/dev/null || [ "$retries" -eq 0 ]; do
        sleep 2
        retries=$((retries - 1))
    done

    if [ "$retries" -eq 0 ]; then
        echo -e "${RED}[Zabbix] PostgreSQL não respondeu a tempo.${NC}"
        return 1
    fi

    local table_exists
    table_exists=$(docker exec "${container_db}" psql -U zabbix -d zabbix -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='token';" 2>/dev/null || echo "0")
    if [ "$table_exists" != "1" ]; then
        echo -e "${YELLOW}[Zabbix] Tabela 'token' ainda não existe.${NC}"
        return 0
    fi

    local token_hash
    token_hash="$(echo -n "${api_token}" | sha512sum | awk '{print $1}')"

    echo -e "[Zabbix] Injetando token permanente SHA-512 no PostgreSQL..."
    docker exec "${container_db}" psql -U zabbix -d zabbix -q -c "
        INSERT INTO token (tokenid, name, description, userid, token, status, expires_at, created_at, creator_userid)
        VALUES (1, 'InfraWatch API Token', 'Automated Bootstrap Token', 1, '${token_hash}', 0, 0, EXTRACT(EPOCH FROM NOW())::int, 1)
        ON CONFLICT (tokenid) DO UPDATE 
        SET token = EXCLUDED.token, 
            status = 0, 
            name = EXCLUDED.name;
    "
    echo -e "${GREEN}[Zabbix] Token permanente injetado com sucesso no PostgreSQL (userid 1 - Admin).${NC}"

    if docker ps --format '{{.Names}}' | grep -q "^${container_web}$"; then
        echo -e "[Zabbix] Validando token via JSON-RPC host.get..."
        local response
        response=$(docker exec "${container_web}" curl -s -X POST \
            -H "Content-Type: application/json-rpc" \
            -H "Authorization: Bearer ${api_token}" \
            -d '{"jsonrpc": "2.0", "method": "host.get", "params": {"output": ["hostid", "name"]}, "id": 1}' \
            http://zabbix-web:8080/api_jsonrpc.php 2>/dev/null || echo "{}")
        
        if echo "$response" | grep -q '"result"'; then
            echo -e "${GREEN}[Zabbix] Validação de API JSON-RPC: OK (Token autenticado e funcional)${NC}"
        else
            echo -e "${YELLOW}[Zabbix] Resposta do Zabbix Web: ${response}${NC}"
        fi
    fi
}

case "$TARGET" in
    glpi)
        bootstrap_glpi
        ;;
    zabbix)
        bootstrap_zabbix
        ;;
    all)
        bootstrap_glpi
        bootstrap_zabbix
        ;;
    *)
        echo "Uso: $0 [glpi|zabbix|all]"
        exit 1
        ;;
esac

echo -e "${GREEN}=== Bootstrap de integrações concluído com sucesso ===${NC}"
