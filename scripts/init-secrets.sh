#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Inicializador de Segredos Docker (Secrets Management)
# Gera arquivos de segredos locais caso ainda não existam.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"

mkdir -p "${SECRETS_DIR}"

create_secret_if_missing() {
    local file_path="${SECRETS_DIR}/$1"
    local default_val="$2"

    if [[ ! -f "${file_path}" ]]; then
        echo -n "${default_val}" > "${file_path}"
        chmod 600 "${file_path}"
        echo "[+] Segredo criado: secrets/$1"
    else
        echo "[.] Segredo já existente: secrets/$1"
    fi
}

echo "=== Inicializando segredos do InfraWatch em ${SECRETS_DIR} ==="

# 1. InfraWatch Core (docker-compose.yml)
create_secret_if_missing "postgres_password.txt" "${POSTGRES_PASSWORD:-infrawatch_secure_password_2026}"
create_secret_if_missing "redis_password.txt" "${REDIS_PASSWORD:-redis_secure_password_2026}"
create_secret_if_missing "secret_key.txt" "${SECRET_KEY:-infrawatch_insecure_dev_secret_key_change_in_production}"
create_secret_if_missing "whatsapp_token.txt" "${WHATSAPP_API_TOKEN:-infrawatch_whatsapp_secret_token_2026}"

# 2. GLPI (docker-compose.glpi.yml)
create_secret_if_missing "glpi_db_root_password.txt" "${GLPI_MYSQL_ROOT_PASSWORD:-root_password_2026}"
create_secret_if_missing "glpi_db_password.txt" "${GLPI_MYSQL_PASSWORD:-glpi_secure_password_2026}"

# 3. Zabbix (docker-compose.zabbix.yml)
create_secret_if_missing "zabbix_db_password.txt" "${ZABBIX_DB_PASSWORD:-zabbix_secure_password_2026}"

echo "=== Todos os segredos foram inicializados com permissões restritas (600) ==="
