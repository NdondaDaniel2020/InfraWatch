# ==============================================================================
# Estágio 1: Builder (Compilação dos artefatos estáticos Vite)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências respeitando o lockfile
COPY package.json package-lock.json* ./
RUN npm ci

# Copia código-fonte e executa a compilação
COPY . .
RUN npm run build

# ==============================================================================
# Estágio 2: Exporter (Exporta artefatos estáticos para o volume compartilhado)
# ==============================================================================
FROM alpine:3.20 AS exporter

LABEL maintainer="InfraWatch Core Team <dev@infrawatch.io>"

WORKDIR /app

# Copia os artefatos compilados do estágio builder
COPY --from=builder /app/dist /app/dist

# Copia script de sincronização e retenção do volume
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Verificação de integridade: checa se os arquivos foram exportados para o volume
HEALTHCHECK --interval=5s --timeout=3s --retries=3 --start-period=2s \
    CMD test -f /usr/share/nginx/html/index.html || exit 1

ENTRYPOINT ["/entrypoint.sh"]
