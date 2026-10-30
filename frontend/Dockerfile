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
# Estágio 2: Exporter (Exporta artefatos para volume compartilhado)
# ==============================================================================
FROM alpine:3.20 AS exporter

WORKDIR /app

# Copia os artefatos compilados do estágio builder
COPY --from=builder /app/dist /app/dist

# Verifica se o volume montado está disponível; se não, usa o diretório local
# Este estágio apenas prepara os arquivos para serem montados via volume
RUN ls /usr/share/nginx/html 2>/dev/null && echo "volume disponivel" || echo "usando local"

# ==============================================================================
# Estágio 3: Runtime (Servidor Nginx ultraleve apenas para produção)
# ==============================================================================
FROM nginx:1.27-alpine

LABEL maintainer="InfraWatch Core Team <dev@infrawatch.io>"

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copia apenas os artefatos estáticos compilados (injeção via volume no compose)
COPY --from=exporter /app/dist /usr/share/nginx/html

# Copia a configuração SPA e healthcheck
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expõe a porta 80 interna
EXPOSE 80

# Verificação de integridade nativa do container
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
    CMD wget -qO- http://127.0.0.1:80/healthz || exit 1

# Inicia o Nginx em primeiro plano
CMD ["nginx", "-g", "daemon off;"]