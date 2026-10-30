#!/bin/sh
set -e

echo "📦 [Frontend Exporter] Sincronizando artefatos estáticos da SPA para o volume compartilhado..."
mkdir -p /usr/share/nginx/html

# Copia artefatos da SPA garantindo sincronização no volume compartilhado
cp -rf /app/dist/* /usr/share/nginx/html/
chmod -R 755 /usr/share/nginx/html

echo "✅ [Frontend Exporter] Artefatos sincronizados em /usr/share/nginx/html com sucesso."

# Mantém o container vivo como daemon de retenção do volume (estilo 42 / Inception)
exec tail -f /dev/null
