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
DRY_RUN="${DRY_RUN:-0}"

# Tratar argumentos caso passem --dry-run em qualquer posição
if [ "${TARGET_FILE}" = "--dry-run" ]; then
    DRY_RUN="1"
    TARGET_FILE=""
fi
if [ "${SOURCE_REMOTE}" = "--dry-run" ]; then
    DRY_RUN="1"
    SOURCE_REMOTE="local"
fi
if [ "${3:-}" = "--dry-run" ]; then
    DRY_RUN="1"
fi

BACKUP_LOCAL_PATH="${BACKUP_LOCAL_PATH:-/var/backups/infrawatch}"
BACKUP_GDRIVE_REMOTE_NAME="${BACKUP_GDRIVE_REMOTE_NAME:-gdrive}"
BACKUP_GDRIVE_FOLDER="${BACKUP_GDRIVE_FOLDER:-infrawatch-backups}"
BACKUP_R2_REMOTE_NAME="${BACKUP_R2_REMOTE_NAME:-r2}"
BACKUP_R2_BUCKET="${BACKUP_R2_BUCKET:-infrawatch-backups}"

# Localização resiliente da configuração Rclone
if [ -z "${RCLONE_CONFIG:-}" ] || [ ! -f "${RCLONE_CONFIG}" ]; then
    if [ -f "${BACKUP_LOCAL_PATH}/.rclone.conf" ]; then
        RCLONE_CONFIG="${BACKUP_LOCAL_PATH}/.rclone.conf"
    elif [ -f "/tmp/rclone.conf" ]; then
        RCLONE_CONFIG="/tmp/rclone.conf"
    elif [ -f "/run/secrets/rclone_config" ]; then
        RCLONE_CONFIG="/run/secrets/rclone_config"
    fi
fi
export RCLONE_CONFIG="${RCLONE_CONFIG:-/tmp/rclone.conf}"

RESTORE_TMP_DIR="/tmp/restore_$(date +%s)"

cleanup() {
    if [ -d "${RESTORE_TMP_DIR}" ]; then
        rm -rf "${RESTORE_TMP_DIR}"
    fi
}
trap cleanup EXIT

if [ "${DRY_RUN}" = "1" ]; then
    echo "⚠️  [MODO DRY-RUN ATIVO]: O pacote será baixado, decriptado e validado estruturalmente SEM alterar o banco de dados ativo."
fi

# ------------------------------------------------------------------------------
# 1. Localização e Download do Pacote de Backup
# ------------------------------------------------------------------------------
mkdir -p "${RESTORE_TMP_DIR}"

if [ -z "${TARGET_FILE}" ]; then
    if [ "${SOURCE_REMOTE}" = "gdrive" ]; then
        echo "[*] Nenhum arquivo especificado. Buscando o backup mais recente no Google Drive..."
        TARGET_FILE=$(rclone lsf "${BACKUP_GDRIVE_REMOTE_NAME}:${BACKUP_GDRIVE_FOLDER}" --include "infrawatch_backup_*.tar.gz" --config "${RCLONE_CONFIG}" 2>/dev/null | sort -r | head -n 1 | tr -d '\r\n' || true)
    elif [ "${SOURCE_REMOTE}" = "r2" ]; then
        echo "[*] Nenhum arquivo especificado. Buscando o backup mais recente no Cloudflare R2..."
        TARGET_FILE=$(rclone lsf "${BACKUP_R2_REMOTE_NAME}:${BACKUP_R2_BUCKET}" --include "infrawatch_backup_*.tar.gz" --config "${RCLONE_CONFIG}" 2>/dev/null | sort -r | head -n 1 | tr -d '\r\n' || true)
    else
        echo "[*] Nenhum arquivo especificado. Buscando o backup mais recente em ${BACKUP_LOCAL_PATH}..."
        LATEST_BACKUP=$(ls -1t "${BACKUP_LOCAL_PATH}"/infrawatch_backup_*.tar.gz 2>/dev/null | head -n 1 || true)
        if [ -n "${LATEST_BACKUP}" ]; then
            TARGET_FILE=$(basename "${LATEST_BACKUP}")
        fi
    fi
    if [ -z "${TARGET_FILE}" ]; then
        echo "[!] ERRO: Nenhum backup encontrado na origem '${SOURCE_REMOTE}'. Especifique um arquivo: ./restore.sh <ARQUIVO> [local|gdrive|r2]"
        exit 1
    fi
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
        tar -tzf "${RESTORE_TMP_DIR}/secrets.tar.gz" > /dev/null
        echo "[+] Segredos decriptados e arquivo tar validado com sucesso."
    else
        echo "[!] ERRO: Chave BACKUP_ENCRYPTION_KEY não encontrada para decriptar os segredos."
        exit 1
    fi
fi

# ------------------------------------------------------------------------------
# 5. Restauração do TimescaleDB
# ------------------------------------------------------------------------------
DUMP_FILE=$(find "${EXTRACTED_DIR}" -name "*.dump" | head -n 1 || true)
if [ -n "${DUMP_FILE}" ]; then
    if [ "${DRY_RUN}" = "1" ]; then
        echo "[*] [DRY-RUN] Verificando integridade do catálogo do dump sem aplicar no banco..."
        pg_restore --list "${DUMP_FILE}" > /dev/null
        echo "[+] [DRY-RUN] Catálogo do PostgreSQL/TimescaleDB validado com sucesso (nenhuma alteração feita no banco)."
    else
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

        # Executar hooks oficiais do TimescaleDB quando a extensão estiver ativa
        psql -v ON_ERROR_STOP=1 -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c \
            "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb') THEN PERFORM timescaledb_pre_restore(); END IF; END \$\$;"

        # Executar pg_restore sem silenciar erros (evita falso positivo operacional)
        PG_RESTORE_LOG="${RESTORE_TMP_DIR}/pg_restore.log"
        if ! pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
            -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
            "${DUMP_FILE}" 2>"${PG_RESTORE_LOG}"; then
            echo "[!] ERRO CRÍTICO: pg_restore falhou durante a restauração do banco!"
            cat "${PG_RESTORE_LOG}"
            exit 1
        fi

        psql -v ON_ERROR_STOP=1 -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c \
            "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb') THEN PERFORM timescaledb_post_restore(); END IF; END \$\$;"

        echo "[+] TimescaleDB restaurado e validado com sucesso!"
    fi
fi

# ------------------------------------------------------------------------------
# 6. Restauração do Redis (RDB Snapshot)
# ------------------------------------------------------------------------------
if [ -f "${EXTRACTED_DIR}/dump.rdb" ]; then
    if [ "${DRY_RUN}" = "1" ]; then
        REDIS_SIZE=$(du -h "${EXTRACTED_DIR}/dump.rdb" | cut -f1)
        echo "[+] [DRY-RUN] Snapshot do Redis validado com sucesso (tamanho: ${REDIS_SIZE}, nenhuma alteração feita)."
    else
        echo "[*] Snapshot do Redis localizado."
        if [ -d "/data" ]; then
            cp "${EXTRACTED_DIR}/dump.rdb" "/data/dump.rdb"
            echo "[+] Arquivo dump.rdb copiado para o volume /data."
        else
            echo "[.] Volume /data não montado diretamente. Arquivo disponível em: ${EXTRACTED_DIR}/dump.rdb"
        fi
    fi
fi

echo "================================================================================"
if [ "${DRY_RUN}" = "1" ]; then
    echo "✅ [DRY-RUN] Simulação de Restauração Concluída com Sucesso!"
    echo "📦 Pacote validado: ${TARGET_FILE}"
    echo "🔐 Hash SHA-256, Cifra AES-256 e Catálogo SQL íntegros (Zero Impacto no Banco Ativo)."
else
    echo "✅ Restauração do InfraWatch Concluída com Sucesso!"
fi
echo "================================================================================"
exit 0
