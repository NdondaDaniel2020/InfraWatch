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
# Estágio 2: Exporter (Exporta artefatos da SPA para volume compartilhado)
# ==============================================================================
FROM alpine:3.20

LABEL maintainer="InfraWatch Core Team <dev@infrawatch.io>"

WORKDIR /app

# Copia os artefatos compilados do estágio builder
COPY --from=builder /app/dist /app/dist

# Copia o script de entrypoint para sincronização com o volume
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Verificação de integridade nativa do container: valida presença do index.html no volume
HEALTHCHECK --interval=5s --timeout=3s --retries=3 --start-period=2s \
    CMD test -f /usr/share/nginx/html/index.html || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
