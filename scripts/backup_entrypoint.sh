#!/bin/bash
# ==============================================================================
# InfraWatch Backup Daemon Entrypoint (ADR-032 / Issue #220)
# ==============================================================================
set -e

echo "=== [InfraWatch Backup Daemon] Inicializando Contêiner ==="

# ------------------------------------------------------------------------------
# 1. Carregamento de Docker Secrets montados em /run/secrets
# ------------------------------------------------------------------------------
if [ -d "/run/secrets" ]; then
    if [ -f "/run/secrets/postgres_password" ]; then
        export POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password | tr -d '\r\n')
    fi
    if [ -f "/run/secrets/redis_password" ]; then
        export REDIS_PASSWORD=$(cat /run/secrets/redis_password | tr -d '\r\n')
    fi
    if [ -f "/run/secrets/backup_encryption_key" ]; then
        export BACKUP_ENCRYPTION_KEY=$(cat /run/secrets/backup_encryption_key | tr -d '\r\n')
    fi
    if [ -f "/run/secrets/telegram_bot_token" ]; then
        export TELEGRAM_BOT_TOKEN=$(cat /run/secrets/telegram_bot_token | tr -d '\r\n')
    fi
    if [ -f "/run/secrets/telegram_chat_id" ]; then
        export TELEGRAM_DEFAULT_CHAT_ID=$(cat /run/secrets/telegram_chat_id | tr -d '\r\n')
    fi
    if [ -f "/run/secrets/default_webhook_url" ]; then
        export DEFAULT_WEBHOOK_URL=$(cat /run/secrets/default_webhook_url | tr -d '\r\n')
    fi
fi

# Configuração de destino local padrão
export BACKUP_LOCAL_PATH="${BACKUP_LOCAL_PATH:-/var/backups/infrawatch}"
mkdir -p "${BACKUP_LOCAL_PATH}" /tmp/backup

# ------------------------------------------------------------------------------
# 2. Configuração do Rclone
# ------------------------------------------------------------------------------
RCLONE_CONF_PATH="/tmp/rclone.conf"
PERSISTED_CONF="${BACKUP_LOCAL_PATH}/.rclone.conf"

if [ -f "${PERSISTED_CONF}" ] && grep -q "refresh_token" "${PERSISTED_CONF}" && ! grep -q '"refresh_token":""' "${PERSISTED_CONF}"; then
    echo "[+] Restaurando configuração persistida do Rclone a partir de ${PERSISTED_CONF}..."
    cp "${PERSISTED_CONF}" "${RCLONE_CONF_PATH}"
    chmod 600 "${RCLONE_CONF_PATH}"
    chmod 644 "${PERSISTED_CONF}" 2>/dev/null || true
elif [ -f "/run/secrets/rclone_config" ]; then
    cp /run/secrets/rclone_config "${RCLONE_CONF_PATH}"
    chmod 600 "${RCLONE_CONF_PATH}"
    cp /run/secrets/rclone_config "${PERSISTED_CONF}" 2>/dev/null || true
    chmod 644 "${PERSISTED_CONF}" 2>/dev/null || true
elif [ -f "/run/secrets/rclone_config.txt" ]; then
    cp /run/secrets/rclone_config.txt "${RCLONE_CONF_PATH}"
    chmod 600 "${RCLONE_CONF_PATH}"
    cp /run/secrets/rclone_config.txt "${PERSISTED_CONF}" 2>/dev/null || true
    chmod 644 "${PERSISTED_CONF}" 2>/dev/null || true
else
    echo "[!] AVISO: /run/secrets/rclone_config não encontrado. Gerando configuração temporária vazia."
    touch "${RCLONE_CONF_PATH}"
    chmod 600 "${RCLONE_CONF_PATH}"
fi
export RCLONE_CONFIG="${RCLONE_CONF_PATH}"

# ------------------------------------------------------------------------------
# 3. Roteamento de Comandos
# ------------------------------------------------------------------------------
case "$1" in
    backup)
        shift
        exec /app/scripts/backup.sh "$@"
        ;;
    restore)
        shift
        exec /app/scripts/restore.sh "$@"
        ;;
    daemon)
        echo "[*] Modo Daemon Ativado (Blast Radius Zero)"
        echo "[*] Agendamento Cron configurado: ${BACKUP_CRON_SCHEDULE:-0 2 * * *}"
        
        # Configurar crontab
        CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 2 * * *}"
        echo "${CRON_SCHEDULE} /app/scripts/backup.sh cron >> /var/log/backup-cron.log 2>&1" > /etc/crontabs/root
        crond -b -l 2

        # Aguardar disponibilidade do Redis
        echo "[*] Aguardando Redis em ${REDIS_HOST:-redis}:${REDIS_PORT:-6379}..."
        until redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" -a "${REDIS_PASSWORD}" --no-auth-warning ping 2>/dev/null | grep -q PONG; do
            sleep 2
        done
        echo "[+] Redis conectado com sucesso."

        # Escutar eventos no canal Pub/Sub do Redis para backup manual e atualização dinâmica de credenciais
        echo "[*] Daemon pronto. Escutando canais Pub/Sub: backup:trigger, backup:config_update"
        
        # Loop de subscrição contínua com reconexão resiliente
        while true; do
            redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" -a "${REDIS_PASSWORD}" --no-auth-warning subscribe backup:trigger backup:config_update | while read -r line; do
                if [ "$line" = "backup:trigger" ]; then
                    read -r payload
                    echo "[+] Sinal recebido via Redis no canal backup:trigger (Payload: ${payload})"
                    /app/scripts/backup.sh manual "${payload}" &
                elif [ "$line" = "backup:config_update" ]; then
                    read -r payload
                    echo "[+] Atualização de configuração Rclone recebida via Redis (backup:config_update)"
                    if echo "${payload}" | grep -q '^{' ; then
                        B64=$(echo "${payload}" | jq -r '.rclone_conf_b64 // empty' 2>/dev/null || true)
                        if [ -n "${B64}" ]; then
                            echo "${B64}" | base64 -d > /tmp/rclone.conf
                            chmod 600 /tmp/rclone.conf
                            cp /tmp/rclone.conf "${PERSISTED_CONF}" 2>/dev/null || true
                            chmod 644 "${PERSISTED_CONF}" 2>/dev/null || true
                            echo "[+] /tmp/rclone.conf atualizado e persistido em ${PERSISTED_CONF} com sucesso."
                        fi
                    fi
                fi
            done
            echo "[!] Conexão com canal Redis encerrada. Reconectando em 3s..."
            sleep 3
        done
        ;;
    *)
        exec "$@"
        ;;
esac
