#!/usr/bin/env bash
# ==============================================================================
# InfraWatch - Pipeline de Backup Automatizado Multi-Destino Dual-Cloud
# Padrão: ADR-032 / Issue #220
# ==============================================================================
set -euo pipefail

TRIGGER_MODE="${1:-manual}"
TRIGGER_PAYLOAD="${2:-{}}"

echo "================================================================================"
echo "  InfraWatch Backup Pipeline — Iniciando (Modo: ${TRIGGER_MODE})"
echo "================================================================================"

# ------------------------------------------------------------------------------
# 1. Carregamento e Verificação de Credenciais
# ------------------------------------------------------------------------------
# Senha do PostgreSQL
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    if [ -f "/run/secrets/postgres_password" ]; then
        POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password | tr -d '\r\n')
    elif [ -f "./secrets/postgres_password.txt" ]; then
        POSTGRES_PASSWORD=$(cat ./secrets/postgres_password.txt | tr -d '\r\n')
    else
        POSTGRES_PASSWORD="infrawatch_secure_password_2026"
    fi
fi
export PGPASSWORD="${POSTGRES_PASSWORD}"

# Senha do Redis
if [ -z "${REDIS_PASSWORD:-}" ]; then
    if [ -f "/run/secrets/redis_password" ]; then
        REDIS_PASSWORD=$(cat /run/secrets/redis_password | tr -d '\r\n')
    elif [ -f "./secrets/redis_password.txt" ]; then
        REDIS_PASSWORD=$(cat ./secrets/redis_password.txt | tr -d '\r\n')
    else
        REDIS_PASSWORD=""
    fi
fi

# Chave mestra de criptografia de segredos (AES-256 PBKDF2)
ENCRYPTION_KEY_FILE="/tmp/backup_key.tmp"
if [ -f "/run/secrets/backup_encryption_key" ]; then
    ENCRYPTION_KEY_PATH="/run/secrets/backup_encryption_key"
elif [ -f "./secrets/backup_encryption_key.txt" ]; then
    ENCRYPTION_KEY_PATH="./secrets/backup_encryption_key.txt"
elif [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo -n "${BACKUP_ENCRYPTION_KEY}" > "${ENCRYPTION_KEY_FILE}"
    chmod 600 "${ENCRYPTION_KEY_FILE}"
    ENCRYPTION_KEY_PATH="${ENCRYPTION_KEY_FILE}"
else
    echo -n "infrawatch_dev_backup_aes256_encryption_key_change_in_prod" > "${ENCRYPTION_KEY_FILE}"
    chmod 600 "${ENCRYPTION_KEY_FILE}"
    ENCRYPTION_KEY_PATH="${ENCRYPTION_KEY_FILE}"
fi

# Configuração do Rclone
if [ -z "${RCLONE_CONFIG:-}" ]; then
    if [ -f "/tmp/rclone.conf" ]; then
        RCLONE_CONFIG="/tmp/rclone.conf"
    elif [ -f "/run/secrets/rclone_config" ]; then
        RCLONE_CONFIG="/run/secrets/rclone_config"
    elif [ -f "./secrets/rclone_config.txt" ]; then
        RCLONE_CONFIG="./secrets/rclone_config.txt"
    else
        RCLONE_CONFIG="/tmp/rclone_empty.conf"
        touch "${RCLONE_CONFIG}"
    fi
fi

# Parâmetros de infraestrutura
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-infrawatch_user}"
POSTGRES_DB="${POSTGRES_DB:-infrawatch_db}"

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"

BACKUP_LOCAL_PATH="${BACKUP_LOCAL_PATH:-/var/backups/infrawatch}"
BACKUP_RETENTION_LOCAL_DAYS="${BACKUP_RETENTION_LOCAL_DAYS:-7}"
BACKUP_RETENTION_REMOTE_DAYS="${BACKUP_RETENTION_REMOTE_DAYS:-30}"
BACKUP_GDRIVE_REMOTE_NAME="${BACKUP_GDRIVE_REMOTE_NAME:-gdrive}"
BACKUP_GDRIVE_FOLDER="${BACKUP_GDRIVE_FOLDER:-infrawatch-backups}"
BACKUP_R2_REMOTE_NAME="${BACKUP_R2_REMOTE_NAME:-r2}"
BACKUP_R2_BUCKET="${BACKUP_R2_BUCKET:-infrawatch-backups}"
BACKUP_NOTIFICATIONS_ENABLED="${BACKUP_NOTIFICATIONS_ENABLED:-true}"

# ------------------------------------------------------------------------------
# 2. Funções Auxiliares: Emissão de Eventos SSE & Notificações
# ------------------------------------------------------------------------------
publish_event() {
    local stage="$1"
    local percent="$2"
    local message="$3"
    local extra="${4:-}"

    echo "[BACKUP-PROGRESS] [${percent}%] (${stage}) ${message}"

    if command -v redis-cli >/dev/null 2>&1; then
        local payload
        if [ -n "${extra}" ]; then
            payload="{\"stage\":\"${stage}\",\"percent\":${percent},\"message\":\"${message}\",${extra}}"
        else
            payload="{\"stage\":\"${stage}\",\"percent\":${percent},\"message\":\"${message}\"}"
        fi
        
        if [ -n "${REDIS_PASSWORD}" ]; then
            redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning publish backup:progress "${payload}" >/dev/null 2>&1 || true
        else
            redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" publish backup:progress "${payload}" >/dev/null 2>&1 || true
        fi
    fi
}

send_notification() {
    local status_msg="$1"
    if [ "${BACKUP_NOTIFICATIONS_ENABLED}" != "true" ]; then
        return 0
    fi

    # Telegram
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_DEFAULT_CHAT_ID:-}" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_DEFAULT_CHAT_ID}" \
            -d "text=${status_msg}" \
            -d "parse_mode=Markdown" >/dev/null 2>&1 || true
    fi

    # Webhook Discord/Slack/Custom
    if [ -n "${DEFAULT_WEBHOOK_URL:-}" ]; then
        curl -s -H "Content-Type: application/json" \
            -X POST "${DEFAULT_WEBHOOK_URL}" \
            -d "{\"content\":\"${status_msg}\"}" >/dev/null 2>&1 || true
    fi
}

cleanup_tmp() {
    if [ -d "${TEMP_DIR:-}" ]; then
        rm -rf "${TEMP_DIR}"
    fi
    if [ -f "${ENCRYPTION_KEY_FILE}" ]; then
        rm -f "${ENCRYPTION_KEY_FILE}"
    fi
}
trap cleanup_tmp EXIT

# ------------------------------------------------------------------------------
# 3. Preparação do Diretório de Trabalho
# ------------------------------------------------------------------------------
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="infrawatch_backup_${TIMESTAMP}"
TEMP_DIR="/tmp/backup/${BACKUP_NAME}"
mkdir -p "${TEMP_DIR}" "${BACKUP_LOCAL_PATH}"

publish_event "started" 5 "Iniciando rotina de backup (Modo: ${TRIGGER_MODE})"

# ------------------------------------------------------------------------------
# 4. Dump do TimescaleDB (Hypertables + Schemas)
# ------------------------------------------------------------------------------
publish_event "timescaledb" 20 "Exportando TimescaleDB e Hypertables..."
DUMP_FILE="${TEMP_DIR}/timescale_${POSTGRES_DB}.dump"

if pg_dump -Fc -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f "${DUMP_FILE}"; then
    echo "[+] Dump do TimescaleDB gerado com sucesso: $(du -h "${DUMP_FILE}" | cut -f1)"
else
    publish_event "error" 0 "Falha ao exportar TimescaleDB"
    send_notification "🚨 *[InfraWatch Alert]* Falha crítica no dump do TimescaleDB durante o backup!"
    exit 1
fi

# ------------------------------------------------------------------------------
# 5. Snapshot do Redis (Cache, Sessions & Outbox Locks)
# ------------------------------------------------------------------------------
publish_event "redis" 40 "Gerando snapshot do Redis..."
REDIS_DUMP_FILE="${TEMP_DIR}/dump.rdb"

# Disparar bgsave e aguardar se o redis-cli estiver disponível
if command -v redis-cli >/dev/null 2>&1; then
    AUTH_PARAM=()
    if [ -n "${REDIS_PASSWORD}" ]; then
        AUTH_PARAM=(-a "${REDIS_PASSWORD}" "--no-auth-warning")
    fi

    # Dispara BGSAVE
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" "${AUTH_PARAM[@]}" bgsave >/dev/null 2>&1 || true
    sleep 2

    # Tenta copiar o arquivo RDB do volume montado ou salvar via stream
    if [ -f "/data/dump.rdb" ]; then
        cp "/data/dump.rdb" "${REDIS_DUMP_FILE}"
    else
        # Fallback: salvar metadados do redis
        redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" "${AUTH_PARAM[@]}" info > "${TEMP_DIR}/redis_info.txt" 2>/dev/null || true
    fi
fi

# ------------------------------------------------------------------------------
# 6. Criptografia AES-256 dos Segredos Docker (/run/secrets)
# ------------------------------------------------------------------------------
publish_event "secrets" 55 "Criptografando credenciais com OpenSSL AES-256..."
SECRETS_SOURCE=""
if [ -d "/run/secrets" ]; then
    SECRETS_SOURCE="/run/secrets"
elif [ -d "./secrets" ]; then
    SECRETS_SOURCE="./secrets"
fi

if [ -n "${SECRETS_SOURCE}" ]; then
    tar -czf - -C "$(dirname "${SECRETS_SOURCE}")" "$(basename "${SECRETS_SOURCE}")" | \
        openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -pass "file:${ENCRYPTION_KEY_PATH}" \
        -out "${TEMP_DIR}/secrets.tar.gz.enc"
    echo "[+] Segredos encriptados com AES-256 PBKDF2."
fi

# ------------------------------------------------------------------------------
# 7. Empacotamento Final do Bundle & Verificação Criptográfica SHA-256
# ------------------------------------------------------------------------------
publish_event "packaging" 70 "Criando pacote consolidado e gerando checksum SHA-256..."

# Criar manifesto de metadados
cat <<EOF > "${TEMP_DIR}/manifest.json"
{
  "backup_name": "${BACKUP_NAME}",
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "database": "${POSTGRES_DB}",
  "trigger_mode": "${TRIGGER_MODE}",
  "app_version": "0.1.0",
  "encryption": "AES-256-CBC-PBKDF2"
}
EOF

BUNDLE_FILE="${BACKUP_LOCAL_PATH}/${BACKUP_NAME}.tar.gz"
tar -czf "${BUNDLE_FILE}" -C "/tmp/backup" "${BACKUP_NAME}"

# Gerar Hash SHA-256
SHA256_HASH=$(sha256sum "${BUNDLE_FILE}" | awk '{print $1}')
echo "${SHA256_HASH}  ${BACKUP_NAME}.tar.gz" > "${BUNDLE_FILE}.sha256"

BUNDLE_SIZE=$(du -h "${BUNDLE_FILE}" | cut -f1)
echo "[+] Pacote gerado: ${BUNDLE_FILE} (${BUNDLE_SIZE})"
echo "[+] Checksum SHA-256: ${SHA256_HASH}"

# ------------------------------------------------------------------------------
# 8. Fan-Out de Upload Multi-Destino
# ------------------------------------------------------------------------------
UPLOAD_GDRIVE_STATUS="Pendente"
UPLOAD_R2_STATUS="Pendente"
UPLOAD_S3_STATUS="Preparado (Comentado)"

# Destino 1: Google Drive
publish_event "upload_gdrive" 80 "Enviando para o Google Drive..."
if rclone copy "${BUNDLE_FILE}" "${BACKUP_GDRIVE_REMOTE_NAME}:${BACKUP_GDRIVE_FOLDER}/" --config "${RCLONE_CONFIG}" --retries 3 2>/dev/null; then
    rclone copy "${BUNDLE_FILE}.sha256" "${BACKUP_GDRIVE_REMOTE_NAME}:${BACKUP_GDRIVE_FOLDER}/" --config "${RCLONE_CONFIG}" 2>/dev/null || true
    UPLOAD_GDRIVE_STATUS="Sucesso"
    echo "[+] Upload para Google Drive concluído com sucesso."
else
    UPLOAD_GDRIVE_STATUS="Falhou / Não Configurado"
    echo "[!] Falha ou falta de configuração para Google Drive. Prosseguindo..."
fi

# Destino 2: Cloudflare R2
publish_event "upload_r2" 90 "Enviando para o Cloudflare R2..."
if rclone copy "${BUNDLE_FILE}" "${BACKUP_R2_REMOTE_NAME}:${BACKUP_R2_BUCKET}/" --config "${RCLONE_CONFIG}" --retries 3 2>/dev/null; then
    rclone copy "${BUNDLE_FILE}.sha256" "${BACKUP_R2_REMOTE_NAME}:${BACKUP_R2_BUCKET}/" --config "${RCLONE_CONFIG}" 2>/dev/null || true
    UPLOAD_R2_STATUS="Sucesso"
    echo "[+] Upload para Cloudflare R2 concluído com sucesso."
else
    UPLOAD_R2_STATUS="Falhou / Não Configurado"
    echo "[!] Falha ou falta de configuração para Cloudflare R2. Prosseguindo..."
fi

# Destino 3: AWS S3 (Preparado para ativação com contas acadêmicas / créditos de estudante)
# //rclone copy "${BACKUP_FILE}" aws_s3:infrawatch-backups/
# rclone copy "${BUNDLE_FILE}" aws_s3:infrawatch-backups/ --config "${RCLONE_CONFIG}" 2>/dev/null || true

# ------------------------------------------------------------------------------
# 9. Rotação & Pruning de Backups Antigos
# ------------------------------------------------------------------------------
publish_event "pruning" 95 "Executando limpeza e política de retenção..."

# Limpeza local (> BACKUP_RETENTION_LOCAL_DAYS dias)
find "${BACKUP_LOCAL_PATH}" -type f -name "infrawatch_backup_*.tar.gz*" -mtime "+${BACKUP_RETENTION_LOCAL_DAYS}" -delete 2>/dev/null || true

# Limpeza remota no Google Drive e Cloudflare R2
rclone delete "${BACKUP_GDRIVE_REMOTE_NAME}:${BACKUP_GDRIVE_FOLDER}" --min-age "${BACKUP_RETENTION_REMOTE_DAYS}d" --config "${RCLONE_CONFIG}" 2>/dev/null || true
rclone delete "${BACKUP_R2_REMOTE_NAME}:${BACKUP_R2_BUCKET}" --min-age "${BACKUP_RETENTION_REMOTE_DAYS}d" --config "${RCLONE_CONFIG}" 2>/dev/null || true

# ------------------------------------------------------------------------------
# 10. Conclusão & Emissão de Relatório
# ------------------------------------------------------------------------------
EXTRA_COMPLETED="\"file\":\"${BACKUP_NAME}.tar.gz\",\"size\":\"${BUNDLE_SIZE}\",\"sha256\":\"${SHA256_HASH}\",\"gdrive\":\"${UPLOAD_GDRIVE_STATUS}\",\"r2\":\"${UPLOAD_R2_STATUS}\""
publish_event "completed" 100 "Backup concluído com sucesso!" "${EXTRA_COMPLETED}"

SUMMARY_MESSAGE="✅ *[InfraWatch]* Rotina de Backup Concluída com Sucesso!
📦 *Arquivo:* \`${BACKUP_NAME}.tar.gz\` (${BUNDLE_SIZE})
🔐 *SHA-256:* \`${SHA256_HASH:0:16}...\`
💾 *Local:* \`${BACKUP_LOCAL_PATH}\` (OK)
☁️ *Google Drive:* ${UPLOAD_GDRIVE_STATUS}
⚡ *Cloudflare R2:* ${UPLOAD_R2_STATUS}
🎓 *AWS S3:* ${UPLOAD_S3_STATUS}"

echo "================================================================================"
echo "${SUMMARY_MESSAGE}"
echo "================================================================================"

send_notification "${SUMMARY_MESSAGE}"
exit 0
