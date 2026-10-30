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
# Estágio 2: Runtime (Servidor Nginx ultraleve de produção desacoplado)
# ==============================================================================
FROM nginx:1.27-alpine

LABEL maintainer="InfraWatch Core Team <dev@infrawatch.io>"

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copia os artefatos estáticos compilados diretamente do builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copia a configuração SPA e healthcheck
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expõe a porta 80 interna
EXPOSE 80

# Verificação de integridade nativa do container
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
    CMD wget -qO- http://127.0.0.1:80/healthz || exit 1

# Inicia o Nginx em primeiro plano
CMD ["nginx", "-g", "daemon off;"]
