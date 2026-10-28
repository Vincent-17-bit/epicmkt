#!/bin/sh
set -eu
cd "$(dirname "$0")"
set -a
. ./.env
set +a
docker compose run --rm --no-deps -p 80:80 --entrypoint certbot certbot certonly --standalone \
  --cert-name epicmkt --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
  -d "$APP_DOMAIN" -d "www.$APP_DOMAIN" -d "$SELLER_DOMAIN" -d "$ADMIN_DOMAIN" -d "$MEDIA_DOMAIN"
docker compose up -d
