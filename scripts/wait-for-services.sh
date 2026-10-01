#!/usr/bin/env bash
# =============================================================================
# InfraWatch - Service Health & Readiness Wait Script
# =============================================================================
set -euo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
MAX_TIMEOUT="${MAX_TIMEOUT:-30}"

echo "⏳ [InfraWatch] Aguardando inicialização de PostgreSQL ($POSTGRES_HOST:$POSTGRES_PORT) e Redis ($REDIS_HOST:$REDIS_PORT)..."

wait_for_port() {
    local host="$1"
    local port="$2"
    local service_name="$3"
    local elapsed=0

    while ! (echo > "/dev/tcp/$host/$port") >/dev/null 2>&1; do
        if [ "$elapsed" -ge "$MAX_TIMEOUT" ]; then
            echo "❌ [InfraWatch] Timeout de ${MAX_TIMEOUT}s atingido aguardando $service_name ($host:$port)!"
            return 1
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo "✅ [InfraWatch] $service_name ($host:$port) está pronto em ${elapsed}s!"
    return 0
}

wait_for_port "$POSTGRES_HOST" "$POSTGRES_PORT" "PostgreSQL"
wait_for_port "$REDIS_HOST" "$REDIS_PORT" "Redis"

echo "🚀 [InfraWatch] Todos os serviços essenciais de infraestrutura estão saudáveis e operacionais!"
