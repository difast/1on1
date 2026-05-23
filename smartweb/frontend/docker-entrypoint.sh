#!/bin/sh
set -e

TEMPLATE=/etc/nginx/conf.d/default.conf.template
TARGET=/etc/nginx/conf.d/default.conf

if [ -n "$API_URL" ]; then
  envsubst '$PORT $API_URL' < "$TEMPLATE" > "$TARGET"
else
  # API_URL not set — strip the /api proxy block so nginx can still start
  sed '/    location \/api {/,/    }/d' "$TEMPLATE" | envsubst '$PORT' > "$TARGET"
fi

exec nginx -g 'daemon off;'
