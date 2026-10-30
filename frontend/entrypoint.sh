#!/bin/sh
set -e

echo "📦 [Frontend Exporter] Sincronizando artefatos estáticos da SPA para o volume compartilhado..."
mkdir -p /usr/share/nginx/html

# Copia artefatos compilados da SPA para o volume compartilhado do Gateway Nginx
cp -rf /app/dist/* /usr/share/nginx/html/
chmod -R 755 /usr/share/nginx/html

echo "✅ [Frontend Exporter] Artefatos sincronizados em /usr/share/nginx/html com sucesso."

# Mantém o container ativo em repouso como retentor de volume
exec tail -f /dev/null
