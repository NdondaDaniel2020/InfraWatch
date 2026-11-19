#!/bin/sh
set -e

# Sincroniza artefatos estáticos da SPA para o volume compartilhado do Gateway Nginx
if [ -d "/app/dist" ]; then
    echo "📦 [Frontend] Sincronizando artefatos estáticos para o volume compartilhado..."
    mkdir -p /usr/share/nginx/html
    rm -rf /usr/share/nginx/html/*
    cp -rf /app/dist/* /usr/share/nginx/html/
    chmod -R 755 /usr/share/nginx/html
    echo "✅ [Frontend] Artefatos sincronizados em /usr/share/nginx/html com sucesso."
fi

exec nginx -g "daemon off;"
