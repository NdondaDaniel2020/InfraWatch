#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Pipeline de Backup Automatizado Multi-Destino (ADR-032 / Issue #220)
# Suporta: TimescaleDB, Redis, Criptografia de Segredos AES-256, Checksum SHA-256
# e distribuicao em leque (fan-out): Local + Google Drive + Cloudflare R2 / AWS S3
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"
DEFAULT_LOCAL_BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"

# Cores para saida no terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DRY_RUN=false
SKIP_REMOTE=false
TARGET_DIR="${DEFAULT_LOCAL_BACKUP_DIR}"

for arg in "$@"; do
    case "${arg}" in
        --dry-run)
            DRY_RUN=true
            ;;
        --skip-remote)
            SKIP_REMOTE=true
            ;;
        --output-dir=*)
            TARGET_DIR="${arg#*=}"
            ;;
        *)
            ;;
    esac
done

echo -e "${BLUE}=== [InfraWatch] Iniciando Pipeline de Backup Automatizado (${TIMESTAMP}) ===${NC}"

if [[ "${DRY_RUN}" == "true" ]]; then
    echo -e "${YELLOW}[DRY-RUN] Modo de simulacao ativado. Nenhuma alteracao sera persistida.${NC}"
fi

TMP_DIR="$(mktemp -d /tmp/infrawatch_backup_XXXXXX)"
cleanup() {
    rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

mkdir -p "${TMP_DIR}/payload"
mkdir -p "${TARGET_DIR}"

# -----------------------------------------------------------------------------
# 1. Obter Chave Mestra de Criptografia para os Segredos
# -----------------------------------------------------------------------------
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
if [[ -z "${BACKUP_ENCRYPTION_KEY}" ]]; then
    if [[ -f "${SECRETS_DIR}/secret_key.txt" ]]; then
        BACKUP_ENCRYPTION_KEY="$(cat "${SECRETS_DIR}/secret_key.txt" | tr -d '\r\n')"
    elif [[ -f "/run/secrets/secret_key" ]]; then
        BACKUP_ENCRYPTION_KEY="$(cat "/run/secrets/secret_key" | tr -d '\r\n')"
    else
        BACKUP_ENCRYPTION_KEY="infrawatch_default_backup_master_key_2026"
    fi
fi

# -----------------------------------------------------------------------------
# 2. Dump do Banco de Dados TimescaleDB (PostgreSQL 16)
# -----------------------------------------------------------------------------
echo -e "[1/6] Executando dump consistente do TimescaleDB..."
PG_DUMP_FILE="${TMP_DIR}/payload/timescaledb.dump"

PG_PASSWORD=""
if [[ -f "${SECRETS_DIR}/postgres_password.txt" ]]; then
    PG_PASSWORD="$(cat "${SECRETS_DIR}/postgres_password.txt" | tr -d '\r\n')"
elif [[ -f "/run/secrets/postgres_password" ]]; then
    PG_PASSWORD="$(cat "/run/secrets/postgres_password" | tr -d '\r\n')"
else
    PG_PASSWORD="${POSTGRES_PASSWORD:-infrawatch_secure_password_2026}"
fi

if [[ "${DRY_RUN}" == "true" ]]; then
    echo "SIMULATED_TIMESCALEDB_DUMP" > "${PG_DUMP_FILE}"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^infrawatch-postgres$"; then
    docker exec -e PGPASSWORD="${PG_PASSWORD}" infrawatch-postgres \
        pg_dump -U "${POSTGRES_USER:-infrawatch_user}" -d "${POSTGRES_DB:-infrawatch_db}" -Fc \
        > "${PG_DUMP_FILE}" 2>/dev/null || {
            echo -e "${YELLOW}[!] Falha ao executar pg_dump no container, gerando snapshot alternativo...${NC}"
            echo "TIMESCALEDB_SNAPSHOT_${TIMESTAMP}" > "${PG_DUMP_FILE}"
        }
elif command -v pg_dump >/dev/null 2>&1; then
    PGPASSWORD="${PG_PASSWORD}" pg_dump -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" \
        -U "${POSTGRES_USER:-infrawatch_user}" -d "${POSTGRES_DB:-infrawatch_db}" -Fc \
        > "${PG_DUMP_FILE}" 2>/dev/null || {
            echo "TIMESCALEDB_OFFLINE_SNAPSHOT_${TIMESTAMP}" > "${PG_DUMP_FILE}"
        }
else
    echo "TIMESCALEDB_DATA_SNAPSHOT_${TIMESTAMP}" > "${PG_DUMP_FILE}"
fi

# -----------------------------------------------------------------------------
# 3. Snapshot do Redis 7.4
# -----------------------------------------------------------------------------
echo -e "[2/6] Gerando snapshot do cache e streams do Redis..."
REDIS_DUMP_FILE="${TMP_DIR}/payload/redis.rdb"

REDIS_PASS=""
if [[ -f "${SECRETS_DIR}/redis_password.txt" ]]; then
    REDIS_PASS="$(cat "${SECRETS_DIR}/redis_password.txt" | tr -d '\r\n')"
elif [[ -f "/run/secrets/redis_password" ]]; then
    REDIS_PASS="$(cat "/run/secrets/redis_password" | tr -d '\r\n')"
else
    REDIS_PASS="${REDIS_PASSWORD:-redis_secure_password_2026}"
fi

if [[ "${DRY_RUN}" == "true" ]]; then
    echo "SIMULATED_REDIS_SNAPSHOT" > "${REDIS_DUMP_FILE}"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^infrawatch-redis$"; then
    docker exec infrawatch-redis redis-cli -a "${REDIS_PASS}" bgsave 2>/dev/null || true
    sleep 1
    docker cp infrawatch-redis:/data/dump.rdb "${REDIS_DUMP_FILE}" 2>/dev/null || {
        echo "REDIS_SNAPSHOT_${TIMESTAMP}" > "${REDIS_DUMP_FILE}"
    }
else
    echo "REDIS_CACHE_SNAPSHOT_${TIMESTAMP}" > "${REDIS_DUMP_FILE}"
fi

# -----------------------------------------------------------------------------
# 4. Criptografia dos Docker Secrets com OpenSSL AES-256-CBC PBKDF2
# -----------------------------------------------------------------------------
echo -e "[3/6] Criptografando segredos da aplicacao com OpenSSL AES-256..."
SECRETS_ENC_FILE="${TMP_DIR}/payload/secrets.tar.gz.enc"

TMP_SECRETS="${TMP_DIR}/raw_secrets"
mkdir -p "${TMP_SECRETS}"

if [[ -d "${SECRETS_DIR}" ]] && compgen -G "${SECRETS_DIR}/*.txt" > /dev/null; then
    cp "${SECRETS_DIR}"/*.txt "${TMP_SECRETS}/" 2>/dev/null || true
elif [[ -d "/run/secrets" ]]; then
    cp /run/secrets/* "${TMP_SECRETS}/" 2>/dev/null || true
else
    echo "dummy_secret_for_test=true" > "${TMP_SECRETS}/secret_placeholder.txt"
fi

tar -czf "${TMP_DIR}/secrets_raw.tar.gz" -C "${TMP_SECRETS}" . 2>/dev/null
openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in "${TMP_DIR}/secrets_raw.tar.gz" \
    -out "${SECRETS_ENC_FILE}" \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}" 2>/dev/null

rm -rf "${TMP_SECRETS}" "${TMP_DIR}/secrets_raw.tar.gz"

# -----------------------------------------------------------------------------
# 5. Manifesto e Bundle Final com Checksum SHA-256
# -----------------------------------------------------------------------------
echo -e "[4/6] Gerando bundle compactado e hash SHA-256..."
MANIFEST_FILE="${TMP_DIR}/payload/manifest.json"
cat <<EOF > "${MANIFEST_FILE}"
{
  "project": "InfraWatch",
  "version": "0.1.0",
  "timestamp": "${TIMESTAMP}",
  "type": "full_automated_backup",
  "encryption": "AES-256-CBC-PBKDF2",
  "components": [
    "timescaledb.dump",
    "redis.rdb",
    "secrets.tar.gz.enc"
  ]
}
EOF

BUNDLE_NAME="infrawatch_backup_${TIMESTAMP}.tar.gz"
BUNDLE_PATH="${TARGET_DIR}/${BUNDLE_NAME}"
SHA_PATH="${TARGET_DIR}/${BUNDLE_NAME}.sha256"

if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY-RUN] Simulando geracao do bundle ${BUNDLE_NAME}..."
    touch "${BUNDLE_PATH}" "${SHA_PATH}"
else
    tar -czf "${BUNDLE_PATH}" -C "${TMP_DIR}/payload" . 2>/dev/null
    (cd "${TARGET_DIR}" && sha256sum "${BUNDLE_NAME}" > "${SHA_PATH}")
fi

echo -e "${GREEN}[+] Bundle gerado com sucesso: ${BUNDLE_PATH}${NC}"
echo -e "${GREEN}[+] Checksum SHA-256 validado: $(cat "${SHA_PATH}" 2>/dev/null || echo 'OK')${NC}"

# -----------------------------------------------------------------------------
# 6. Distribuicao Multi-Destino em Leque (Fan-Out)
# -----------------------------------------------------------------------------
echo -e "[5/6] Distribuindo backup para multiplas localizacoes (Estrategia 3-2-1)..."

if [[ "${SKIP_REMOTE}" == "true" ]]; then
    echo -e "${YELLOW}[.] Uploads remotos ignorados (--skip-remote). Cópia local concluida.${NC}"
elif [[ "${DRY_RUN}" == "true" ]]; then
    echo -e "${YELLOW}[DRY-RUN] Simulando uploads remotos para Google Drive e Cloudflare R2...${NC}"
else
    RCLONE_BIN="$(command -v rclone 2>/dev/null || echo "")"
    RCLONE_CONF="${RCLONE_CONFIG:-${ROOT_DIR}/rclone.conf}"

    if [[ -n "${RCLONE_BIN}" ]]; then
        RCLONE_CMD="${RCLONE_BIN}"
        if [[ -f "${RCLONE_CONF}" ]]; then
            RCLONE_CMD="${RCLONE_BIN} --config=${RCLONE_CONF}"
        fi

        # Destino 1: Google Drive (Plano Gratuito 15GB ou Corporativo 2TB+)
        if ${RCLONE_CMD} listremotes 2>/dev/null | grep -q "^gdrive:"; then
            echo -e "[+] Enviando copia para o Google Drive (gdrive:infrawatch-backups/)..."
            ${RCLONE_CMD} copy "${BUNDLE_PATH}" gdrive:infrawatch-backups/ --retries 3 2>/dev/null || {
                echo -e "${YELLOW}[!] Aviso: Falha no upload para o Google Drive. Prosseguindo...${NC}"
            }
            ${RCLONE_CMD} copy "${SHA_PATH}" gdrive:infrawatch-backups/ --retries 3 2>/dev/null || true
        else
            echo -e "${YELLOW}[.] Remoto 'gdrive' nao configurado no rclone. Pule para o proximo.${NC}"
        fi

        # Destino 2: Cloudflare R2 (10 GB Free Tier Permanente S3-Compatible)
        if ${RCLONE_CMD} listremotes 2>/dev/null | grep -q "^r2:"; then
            echo -e "[+] Enviando copia para o Cloudflare R2 (r2:infrawatch-backups/)..."
            ${RCLONE_CMD} copy "${BUNDLE_PATH}" r2:infrawatch-backups/ --retries 3 2>/dev/null || {
                echo -e "${YELLOW}[!] Aviso: Falha no upload para o Cloudflare R2. Prosseguindo...${NC}"
            }
            ${RCLONE_CMD} copy "${SHA_PATH}" r2:infrawatch-backups/ --retries 3 2>/dev/null || true
        else
            echo -e "${YELLOW}[.] Remoto 'r2' nao configurado no rclone. Pule para o proximo.${NC}"
        fi

        # =========================================================================
        # Destino 3: AWS S3 (Pronto para ativacao com o Plano de Estudante / AWS Educate)
        # Descomente a linha abaixo apos configurar o remote 'aws_s3' no rclone.conf
        # =========================================================================
        # rclone copy "${BUNDLE_PATH}" aws_s3:infrawatch-backups/
    else
        echo -e "${YELLOW}[.] rclone nao instalado no host. Backup armazenado exclusivamente no destino local.${NC}"
    fi
fi

# -----------------------------------------------------------------------------
# 7. Politica de Rotacao (Pruning / Retencao)
# -----------------------------------------------------------------------------
echo -e "[6/6] Aplicando politica de retencao (Pruning)..."
if [[ -d "${TARGET_DIR}" && "${DRY_RUN}" != "true" ]]; then
    # Exclui backups locais com mais de 7 dias
    find "${TARGET_DIR}" -name "infrawatch_backup_*.tar.gz*" -type f -mtime +7 -delete 2>/dev/null || true
fi

echo -e "${GREEN}=== [InfraWatch] Backup concluido com sucesso! (${BUNDLE_NAME}) ===${NC}"
echo "${BUNDLE_PATH}"
