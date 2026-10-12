#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Inicializador de Segredos Docker (Secrets Management)
# Gera arquivos de segredos locais caso ainda não existam.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
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

# -----------------------------------------------------------------------------
# 1. Core — Banco de dados e cache (docker-compose.yml)
# -----------------------------------------------------------------------------
create_secret_if_missing "postgres_password.txt"   "${POSTGRES_PASSWORD:-infrawatch_secure_password_2026}"
create_secret_if_missing "redis_password.txt"       "${REDIS_PASSWORD:-redis_secure_password_2026}"

# -----------------------------------------------------------------------------
# 2. Segurança / JWT (docker-compose.yml)
# -----------------------------------------------------------------------------
create_secret_if_missing "secret_key.txt"           "${SECRET_KEY:-infrawatch_insecure_dev_secret_key_change_in_production}"
create_secret_if_missing "refresh_secret_key.txt"   "${REFRESH_SECRET_KEY:-infrawatch_insecure_refresh_key_change_in_production}"
create_secret_if_missing "oauth_state_secret.txt"   "${OAUTH_STATE_SECRET:-infrawatch_insecure_oauth_state_change_in_production}"
create_secret_if_missing "mfa_pending_secret.txt"   "${MFA_PENDING_SECRET:-infrawatch_insecure_mfa_pending_change_in_production}"

# -----------------------------------------------------------------------------
# 3. SMTP
# -----------------------------------------------------------------------------
create_secret_if_missing "smtp_password.txt"        "${SMTP_PASSWORD:-dev_smtp_password_change_in_production}"

# -----------------------------------------------------------------------------
# 4. Google OAuth 2.0
# -----------------------------------------------------------------------------
create_secret_if_missing "google_client_id.txt"     "${GOOGLE_CLIENT_ID:-dev_google_client_id}"
create_secret_if_missing "google_client_secret.txt" "${GOOGLE_CLIENT_SECRET:-dev_google_client_secret}"

# -----------------------------------------------------------------------------
# 5. Admin Seed
# -----------------------------------------------------------------------------
create_secret_if_missing "admin_email.txt"          "${ADMIN_EMAIL:-noc-admin@rcsangola.co.ao}"
create_secret_if_missing "admin_password.txt"       "${ADMIN_PASSWORD:-Admin#Dev2026!ChangeMe}"

# -----------------------------------------------------------------------------
# 6. GLPI ITSM Integration
# -----------------------------------------------------------------------------
create_secret_if_missing "glpi_app_token.txt"       "${GLPI_APP_TOKEN:-infrawatch_app_token_secret_2026}"
create_secret_if_missing "glpi_user_token.txt"      "${GLPI_USER_TOKEN:-infrawatch_user_token_secret_2026}"

# -----------------------------------------------------------------------------
# 7. Zabbix JSON-RPC Integration
# -----------------------------------------------------------------------------
create_secret_if_missing "zabbix_api_url.txt"       "${ZABBIX_API_URL:-http://localhost:8081/api_jsonrpc.php}"
create_secret_if_missing "zabbix_api_token.txt"     "${ZABBIX_API_TOKEN:-dev_zabbix_api_token_change_in_production}"
create_secret_if_missing "zabbix_password.txt"      "${ZABBIX_PASSWORD:-zabbix}"

# -----------------------------------------------------------------------------
# 8. Notificações — Telegram, WhatsApp, Webhook
# -----------------------------------------------------------------------------
create_secret_if_missing "telegram_bot_token.txt"   "${TELEGRAM_BOT_TOKEN:-dev_telegram_token_change_in_production}"
create_secret_if_missing "telegram_chat_id.txt"     "${TELEGRAM_DEFAULT_CHAT_ID:--0000000000}"
create_secret_if_missing "whatsapp_token.txt"       "${WHATSAPP_API_TOKEN:-infrawatch_whatsapp_secret_token_2026}"
create_secret_if_missing "whatsapp_gateway_url.txt" "${WHATSAPP_GATEWAY_URL:-http://localhost:8085/message/sendText/infrawatch}"
create_secret_if_missing "default_webhook_url.txt"  "${DEFAULT_WEBHOOK_URL:-https://discord.com/api/webhooks/dev_webhook}"

# -----------------------------------------------------------------------------
# 9. Prometheus Metrics
# -----------------------------------------------------------------------------
create_secret_if_missing "prometheus_metrics_user.txt" "${PROMETHEUS_METRICS_USER:-metrics_admin}"
create_secret_if_missing "prometheus_metrics_pass.txt" "${PROMETHEUS_METRICS_PASSWORD:-metrics_secure_password}"

# -----------------------------------------------------------------------------
# 10. GLPI Stack (docker-compose.glpi.yml)
# -----------------------------------------------------------------------------
create_secret_if_missing "glpi_db_root_password.txt" "${GLPI_MYSQL_ROOT_PASSWORD:-root_password_2026}"
create_secret_if_missing "glpi_db_password.txt"      "${GLPI_MYSQL_PASSWORD:-glpi_secure_password_2026}"

# -----------------------------------------------------------------------------
# 11. Zabbix Stack (docker-compose.zabbix.yml)
# -----------------------------------------------------------------------------
create_secret_if_missing "zabbix_db_password.txt"   "${ZABBIX_DB_PASSWORD:-zabbix_secure_password_2026}"

echo "=== Todos os segredos foram inicializados com permissões restritas (600) ==="
