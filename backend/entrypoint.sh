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
                    export WHATSAPP_API_TOKEN="$secret_val"
                    ;;
                *)
                    # Converte genericamente nome_do_segredo para NOME_DO_SEGREDO
                    env_var=$(echo "$secret_name" | tr '[:lower:]' '[:upper:]')
                    export "$env_var"="$secret_val"
                    ;;
            esac
        fi
    done
fi

# Executa o comando passado para o container preservando sinais de SO (graceful shutdown)
exec "$@"
