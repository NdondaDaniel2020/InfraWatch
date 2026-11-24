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
COPY --from=builder /app/.env.production* /app/

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

# Copia configuração Nginx com suporte a IPv4/IPv6 e endpoint /healthz
COPY default.conf /etc/nginx/conf.d/default.conf

# Copia os artefatos compilados para /app/dist e para o diretório padrão
COPY --from=exporter /app/dist /app/dist
COPY --from=exporter /app/dist /usr/share/nginx/html
COPY --from=exporter /app/.env.production* /app/

# Copia e configura o script de inicialização para sincronização do volume compartilhado
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expõe a porta 80 interna
EXPOSE 80

# Verificação de integridade nativa do container
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
    CMD wget -qO- http://localhost:80/healthz || exit 1

# Sincroniza o volume compartilhado antes de subir o Nginx
ENTRYPOINT ["/entrypoint.sh"]