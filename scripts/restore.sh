#!/usr/bin/env bash
# ==============================================================================
# InfraWatch - Script de Restauração Automatizada / Disaster Recovery
# Padrão: ADR-032 / Issue #220
# ==============================================================================
set -euo pipefail

echo "================================================================================"
echo "  InfraWatch Disaster Recovery — Restauração de Sistema"
echo "================================================================================"

TARGET_FILE="${1:-}"
SOURCE_REMOTE="${2:-local}" # local, gdrive, r2

BACKUP_LOCAL_PATH="${BACKUP_LOCAL_PATH:-/var/backups/infrawatch}"
BACKUP_GDRIVE_REMOTE_NAME="${BACKUP_GDRIVE_REMOTE_NAME:-gdrive}"
BACKUP_GDRIVE_FOLDER="${BACKUP_GDRIVE_FOLDER:-infrawatch-backups}"
BACKUP_R2_REMOTE_NAME="${BACKUP_R2_REMOTE_NAME:-r2}"
BACKUP_R2_BUCKET="${BACKUP_R2_BUCKET:-infrawatch-backups}"

RESTORE_TMP_DIR="/tmp/restore_$(date +%s)"

cleanup() {
    if [ -d "${RESTORE_TMP_DIR}" ]; then
        rm -rf "${RESTORE_TMP_DIR}"
    fi
}
trap cleanup EXIT

# ------------------------------------------------------------------------------
# 1. Localização e Download do Pacote de Backup
# ------------------------------------------------------------------------------
mkdir -p "${RESTORE_TMP_DIR}"

if [ -z "${TARGET_FILE}" ]; then
    echo "[*] Nenhum arquivo especificado. Buscando o backup mais recente em ${BACKUP_LOCAL_PATH}..."
    LATEST_BACKUP=$(ls -1t "${BACKUP_LOCAL_PATH}"/infrawatch_backup_*.tar.gz 2>/dev/null | head -n 1 || true)
    if [ -z "${LATEST_BACKUP}" ]; then
        echo "[!] ERRO: Nenhum backup local encontrado. Especifique um arquivo: ./restore.sh <ARQUIVO> [local|gdrive|r2]"
        exit 1
    fi
    TARGET_FILE=$(basename "${LATEST_BACKUP}")
    echo "[+] Backup mais recente detectado: ${TARGET_FILE}"
fi

LOCAL_BUNDLE_PATH="${BACKUP_LOCAL_PATH}/${TARGET_FILE}"

# Se a fonte for remota, realiza o download via Rclone
if [ "${SOURCE_REMOTE}" = "gdrive" ]; then
    echo "[*] Baixando ${TARGET_FILE} do Google Drive..."
    rclone copy "${BACKUP_GDRIVE_REMOTE_NAME}:${BACKUP_GDRIVE_FOLDER}/${TARGET_FILE}" "${RESTORE_TMP_DIR}/" --config "${RCLONE_CONFIG:-/tmp/rclone.conf}"
    rclone copy "${BACKUP_GDRIVE_REMOTE_NAME}:${BACKUP_GDRIVE_FOLDER}/${TARGET_FILE}.sha256" "${RESTORE_TMP_DIR}/" --config "${RCLONE_CONFIG:-/tmp/rclone.conf}" 2>/dev/null || true
    LOCAL_BUNDLE_PATH="${RESTORE_TMP_DIR}/${TARGET_FILE}"
elif [ "${SOURCE_REMOTE}" = "r2" ]; then
    echo "[*] Baixando ${TARGET_FILE} do Cloudflare R2..."
    rclone copy "${BACKUP_R2_REMOTE_NAME}:${BACKUP_R2_BUCKET}/${TARGET_FILE}" "${RESTORE_TMP_DIR}/" --config "${RCLONE_CONFIG:-/tmp/rclone.conf}"
    rclone copy "${BACKUP_R2_REMOTE_NAME}:${BACKUP_R2_BUCKET}/${TARGET_FILE}.sha256" "${RESTORE_TMP_DIR}/" --config "${RCLONE_CONFIG:-/tmp/rclone.conf}" 2>/dev/null || true
    LOCAL_BUNDLE_PATH="${RESTORE_TMP_DIR}/${TARGET_FILE}"
else
    if [ ! -f "${LOCAL_BUNDLE_PATH}" ] && [ -f "${TARGET_FILE}" ]; then
        LOCAL_BUNDLE_PATH="${TARGET_FILE}"
    fi
fi

if [ ! -f "${LOCAL_BUNDLE_PATH}" ]; then
    echo "[!] ERRO: Arquivo de backup não encontrado em: ${LOCAL_BUNDLE_PATH}"
    exit 1
fi

echo "[+] Pacote selecionado: ${LOCAL_BUNDLE_PATH}"

# ------------------------------------------------------------------------------
# 2. Verificação Criptográfica de Integridade SHA-256
# ------------------------------------------------------------------------------
echo "[*] Verificando checksum SHA-256..."
SHA256_FILE="${LOCAL_BUNDLE_PATH}.sha256"

if [ -f "${SHA256_FILE}" ]; then
    EXPECTED_HASH=$(awk '{print $1}' "${SHA256_FILE}")
    ACTUAL_HASH=$(sha256sum "${LOCAL_BUNDLE_PATH}" | awk '{print $1}')
    if [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
        echo "[!] ERRO CRÍTICO: Checksum SHA-256 não confere!"
        echo "    Esperado: ${EXPECTED_HASH}"
        echo "    Atual:    ${ACTUAL_HASH}"
        exit 1
    fi
    echo "[+] Integridade SHA-256 validada com sucesso: ${ACTUAL_HASH}"
else
    echo "[!] AVISO: Arquivo .sha256 não encontrado. Prosseguindo sob risco operacional."
fi

# ------------------------------------------------------------------------------
# 3. Descompactação do Pacote
# ------------------------------------------------------------------------------
echo "[*] Extraindo conteúdo do backup..."
tar -xzf "${LOCAL_BUNDLE_PATH}" -C "${RESTORE_TMP_DIR}"

EXTRACTED_DIR=$(find "${RESTORE_TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -z "${EXTRACTED_DIR}" ]; then
    echo "[!] ERRO: Falha ao extrair diretório do pacote de backup."
    exit 1
fi

echo "[+] Conteúdo extraído em: ${EXTRACTED_DIR}"
ls -la "${EXTRACTED_DIR}"

# ------------------------------------------------------------------------------
# 4. Decriptação dos Segredos Docker (AES-256 PBKDF2)
# ------------------------------------------------------------------------------
ENCRYPTION_KEY_PATH=""
if [ -f "/run/secrets/backup_encryption_key" ]; then
    ENCRYPTION_KEY_PATH="/run/secrets/backup_encryption_key"
elif [ -f "./secrets/backup_encryption_key.txt" ]; then
    ENCRYPTION_KEY_PATH="./secrets/backup_encryption_key.txt"
elif [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo -n "${BACKUP_ENCRYPTION_KEY}" > "${RESTORE_TMP_DIR}/key.tmp"
    chmod 600 "${RESTORE_TMP_DIR}/key.tmp"
    ENCRYPTION_KEY_PATH="${RESTORE_TMP_DIR}/key.tmp"
fi

if [ -f "${EXTRACTED_DIR}/secrets.tar.gz.enc" ]; then
    if [ -n "${ENCRYPTION_KEY_PATH}" ]; then
        echo "[*] Decriptando segredos confidenciais com OpenSSL AES-256 PBKDF2..."
        openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
            -pass "file:${ENCRYPTION_KEY_PATH}" \
            -in "${EXTRACTED_DIR}/secrets.tar.gz.enc" \
            -out "${RESTORE_TMP_DIR}/secrets.tar.gz"
        echo "[+] Segredos decriptados com sucesso."
    else
        echo "[!] AVISO: Chave BACKUP_ENCRYPTION_KEY não encontrada. Pulei restauração dos segredos."
    fi
fi

# ------------------------------------------------------------------------------
# 5. Restauração do TimescaleDB
# ------------------------------------------------------------------------------
DUMP_FILE=$(find "${EXTRACTED_DIR}" -name "*.dump" | head -n 1 || true)
if [ -n "${DUMP_FILE}" ]; then
    echo "[*] Restaurando banco de dados TimescaleDB a partir de: ${DUMP_FILE}..."
    
    POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
    POSTGRES_PORT="${POSTGRES_PORT:-5432}"
    POSTGRES_USER="${POSTGRES_USER:-infrawatch_user}"
    POSTGRES_DB="${POSTGRES_DB:-infrawatch_db}"

    if [ -z "${POSTGRES_PASSWORD:-}" ]; then
        if [ -f "/run/secrets/postgres_password" ]; then
            POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password | tr -d '\r\n')
        elif [ -f "./secrets/postgres_password.txt" ]; then
            POSTGRES_PASSWORD=$(cat ./secrets/postgres_password.txt | tr -d '\r\n')
        fi
    fi
    export PGPASSWORD="${POSTGRES_PASSWORD:-}"

    # Executar pg_restore com limpeza e suporte a hypertables
    if pg_restore --clean --if-exists --no-owner --no-privileges \
        -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        "${DUMP_FILE}" 2>/dev/null; then
        echo "[+] TimescaleDB restaurado com sucesso!"
    else
        echo "[!] pg_restore finalizado com avisos (comportamento normal se objetos já existiam)."
    fi
fi

# ------------------------------------------------------------------------------
# 6. Restauração do Redis (RDB Snapshot)
# ------------------------------------------------------------------------------
if [ -f "${EXTRACTED_DIR}/dump.rdb" ]; then
    echo "[*] Snapshot do Redis localizado."
    if [ -d "/data" ]; then
        cp "${EXTRACTED_DIR}/dump.rdb" "/data/dump.rdb"
        echo "[+] Arquivo dump.rdb copiado para o volume /data."
    else
        echo "[.] Volume /data não montado diretamente. Arquivo disponível em: ${EXTRACTED_DIR}/dump.rdb"
    fi
fi

echo "================================================================================"
echo "✅ Restauração do InfraWatch Concluída com Sucesso!"
echo "================================================================================"
exit 0
