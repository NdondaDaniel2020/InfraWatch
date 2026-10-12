#!/bin/sh
set -e

# ==============================================================================
# InfraWatch Container Entrypoint
# Exporta segredos montados pelo Docker em /run/secrets/ como variáveis de ambiente
# antes de inicializar o processo da aplicação.
#
# Isso mantém o código da aplicação Python 100% desacoplado do Docker e agnóstico
# ao ambiente de execução (12-Factor App).
# ==============================================================================

if [ -d "/run/secrets" ]; then
    for secret_path in /run/secrets/*; do
        if [ -f "$secret_path" ]; then
            secret_name=$(basename "$secret_path")
            secret_val=$(cat "$secret_path" 2>/dev/null | tr -d '\r\n')

            case "$secret_name" in
                postgres_password)
                    export POSTGRES_PASSWORD="$secret_val"
                    ;;
                redis_password)
                    export REDIS_PASSWORD="$secret_val"
                    ;;
                secret_key)
                    export SECRET_KEY="$secret_val"
                    ;;
                whatsapp_token)
                    # Nome do arquivo difere do nome da variável
                    export WHATSAPP_API_TOKEN="$secret_val"
                    ;;
                telegram_chat_id)
                    # Nome do arquivo difere do nome da variável
                    export TELEGRAM_DEFAULT_CHAT_ID="$secret_val"
                    ;;
                prometheus_metrics_pass)
                    # Nome do arquivo difere do nome da variável
                    export PROMETHEUS_METRICS_PASSWORD="$secret_val"
                    ;;
                *)
                    # Fallback genérico: nome_do_segredo → NOME_DO_SEGREDO
                    # Cobre: refresh_secret_key, oauth_state_secret, mfa_pending_secret,
                    # smtp_password, google_client_id, google_client_secret,
                    # admin_email, admin_password, glpi_app_token, glpi_user_token,
                    # zabbix_api_url, zabbix_api_token, zabbix_password,
                    # telegram_bot_token, whatsapp_gateway_url,
                    # default_webhook_url, prometheus_metrics_user, etc.
                    env_var=$(echo "$secret_name" | tr '[:lower:]' '[:upper:]')
                    export "$env_var"="$secret_val"
                    ;;
            esac
        fi
    done
fi

# ------------------------------------------------------------------------------
# Constrói DATABASE_URL e REDIS_URL a partir dos componentes + segredos exportados.
# Evita senhas embutidas no .env de produção (os componentes individuais são seguros).
# ------------------------------------------------------------------------------
if [ -n "${POSTGRES_PASSWORD:-}" ] && [ -n "${POSTGRES_HOST:-}" ]; then
    export DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER:-infrawatch_user}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-infrawatch_db}"
fi

if [ -n "${REDIS_PASSWORD:-}" ] && [ -n "${REDIS_HOST:-}" ]; then
    export REDIS_URL="redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT:-6379}/${REDIS_DB:-0}"
fi

# Executa o comando passado para o container preservando sinais de SO (graceful shutdown)
exec "$@"
