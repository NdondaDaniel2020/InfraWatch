#!/bin/sh
# ==============================================================================
# InfraWatch - Reconciliação Automática de Metadados de Backup (.meta.json)
# Sincroniza o status real dos backups com base no armazenamento local e Google Drive
# ==============================================================================
set -e

BACKUP_LOCAL_PATH="${BACKUP_LOCAL_PATH:-/var/backups/infrawatch}"
RCLONE_CONF="${RCLONE_CONFIG:-/tmp/rclone.conf}"

echo "=== [InfraWatch] Iniciando Reconciliação de Metadados de Backup ==="

# Obter lista de arquivos no Google Drive de uma só vez para alta performance
GDRIVE_FILES=$(rclone lsf gdrive:infrawatch-backups/ --config "${RCLONE_CONF}" 2>/dev/null || true)

for file in "${BACKUP_LOCAL_PATH}"/infrawatch_backup_*.tar.gz; do
    [ -f "$file" ] || continue
    
    fname=$(basename "$file")
    meta_file="${file}.meta.json"
    sha_file="${file}.sha256"

    # 1. Determinar SHA-256
    sha256=""
    if [ -f "$sha_file" ]; then
        sha256=$(awk '{print $1}' "$sha_file")
    else
        sha256=$(sha256sum "$file" | awk '{print $1}')
        echo "$sha256  $fname" > "$sha_file"
    fi

    # 2. Determinar Tamanho Legível
    size_human=$(du -h "$file" | awk '{print $1}')

    # 3. Determinar se é Cron ou Manual
    case "$fname" in
        *_020000.tar.gz|*0200*.tar.gz)
            trigger="scheduled"
            notes="Rotina automática diária (Cron 02:00 UTC)"
            ;;
        *)
            trigger="manual"
            notes="Disparo manual sob demanda"
            ;;
    esac

    # 4. Verificar se existe no Google Drive
    if echo "$GDRIVE_FILES" | grep -qx "$fname"; then
        gdrive_status="SUCCESS"
    else
        gdrive_status="SKIPPED"
    fi

    # 5. Timestamp em ISO 8601 UTC
    # Extrair timestamp do nome do arquivo se possível: infrawatch_backup_YYYYMMDD_HHMMSS.tar.gz
    raw_date=$(echo "$fname" | sed -n 's/infrawatch_backup_\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\).*/\1-\2-\3T\4:\5:\6Z/p')
    if [ -n "$raw_date" ]; then
        timestamp="$raw_date"
    else
        timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    fi

    # Preservar notas existentes se já definidas
    if [ -f "$meta_file" ]; then
        existing_notes=$(jq -r '.notes // empty' "$meta_file" 2>/dev/null || true)
        if [ -n "$existing_notes" ]; then
            notes="$existing_notes"
        fi
        existing_trigger=$(jq -r '.trigger // empty' "$meta_file" 2>/dev/null || true)
        if [ -n "$existing_trigger" ]; then
            trigger="$existing_trigger"
        fi
    fi

    # 6. Gravar .meta.json com targets fidedignos
    cat <<EOF > "$meta_file"
{
  "backup_name": "$fname",
  "timestamp": "$timestamp",
  "database": "infrawatch_db",
  "trigger": "$trigger",
  "notes": "$notes",
  "sha256": "$sha256",
  "size_human": "$size_human",
  "targets": {
    "local": "SUCCESS",
    "gdrive": "$gdrive_status",
    "r2": "SKIPPED"
  }
}
EOF
    echo "[+] Reconciliado: $fname -> Local: SUCCESS | GDrive: $gdrive_status"
done

echo "=== [InfraWatch] Reconciliação Concluída com Sucesso! ==="
