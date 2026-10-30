#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Script Idempotente de Geração de Certificados SSL/TLS (Issue #270)
# Gera certificados autoassinados com SAN apontando para infrawatch.42.fr
# Suporte: infrawatch.42.fr, *.infrawatch.42.fr, localhost, 127.0.0.1, infrawatch.local
# Usage: ./scripts/init-certs.sh
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
CERTS_DIR="${ROOT_DIR}/certs"

mkdir -p "${CERTS_DIR}"

# Verificação idempotente: se certificados válidos já existirem e contiverem infrawatch.42.fr, não sobrescrever
if [[ -f "${CERTS_DIR}/fullchain.pem" && -f "${CERTS_DIR}/privkey.pem" ]]; then
    if openssl x509 -in "${CERTS_DIR}/fullchain.pem" -noout -text 2>/dev/null | grep -qi "infrawatch.42.fr"; then
        if openssl x509 -in "${CERTS_DIR}/fullchain.pem" -noout -dates 2>/dev/null | grep -qi "notafter"; then
            echo "[.] Certificados SSL já existem e são válidos para infrawatch.42.fr em ${CERTS_DIR}"
            echo "[.] Para regenerar, execute: make certs-clean && make certs"
            exit 0
        fi
    fi
fi

echo "🔑 Gerando chave privada RSA (2048 bits)..."
openssl genrsa -out "${CERTS_DIR}/privkey.pem" 2048 2>/dev/null

echo "📜 Gerando certificado autoassinado para infrawatch.42.fr com SAN..."
openssl req -new -x509 \
    -key "${CERTS_DIR}/privkey.pem" \
    -out "${CERTS_DIR}/fullchain.pem" \
    -days 365 \
    -subj "/C=AO/ST=Luanda/L=Luanda/O=42Luanda/OU=InfraWatch/CN=infrawatch.42.fr" \
    -addext "subjectAltName=DNS:infrawatch.42.fr,DNS:*.infrawatch.42.fr,DNS:localhost,IP:127.0.0.1,DNS:infrawatch.local" \
    2>/dev/null

# Permissões restritas
chmod 600 "${CERTS_DIR}/privkey.pem"
chmod 644 "${CERTS_DIR}/fullchain.pem"

echo "[+] Certificados SSL/TLS gerados com sucesso em ${CERTS_DIR}:"
echo "    - fullchain.pem (CN: infrawatch.42.fr, permissão 644)"
echo "    - privkey.pem   (Chave privada RSA, permissão 600)"
