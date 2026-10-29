#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Script Idempotente de Geracao de Certificados SSL/TLS
# Gera certificados autoassinados com SAN para ambientes de desenvolvimento.
# Suporto: localhost, 127.0.0.1, infrawatch.local, *.infrawatch.local
# Usage: ./scripts/init-certs.sh
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
CERTS_DIR="${ROOT_DIR}/certs"

mkdir -p "${CERTS_DIR}"

# Verificacao idempotente: se certificados validos ja existirem, nao sobrescrever
if [[ -f "${CERTS_DIR}/fullchain.pem" && -f "${CERTS_DIR}/privkey.pem" ]]; then
    if openssl x509 -in "${CERTS_DIR}/fullchain.pem" -noout -dates -subject 2>/dev/null | grep -q "not after"; then
        echo "[.] Certificados SSL ja existem e sao validos em ${CERTS_DIR}"
        echo "[.] Para regenerar, execute: make certs-clean && ./scripts/init-certs.sh"
        exit 0
    fi
fi

# Chave privada RSA 2048 bits
openssl genrsa -out "${CERTS_DIR}/privkey.pem" 2048 2>/dev/null

# Certificado autoassinado com validade de 365 dias e SAN
openssl req -new -x509 \
    -key "${CERTS_DIR}/privkey.pem" \
    -out "${CERTS_DIR}/fullchain.pem" \
    -days 365 \
    -subj "/CN=infrawatch.local" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:infrawatch.local,DNS:*.infrawatch.local" \
    2>/dev/null

# Permissoes rigidas
chmod 600 "${CERTS_DIR}/privkey.pem"
chmod 644 "${CERTS_DIR}/fullchain.pem"

echo "[+] Certificados SSL/TLS gerados com sucesso em ${CERTS_DIR}"
echo "    - fullchain.pem (publico, permissao 644)"
echo "    - privkey.pem (privado, permissao 600)"