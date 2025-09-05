#!/usr/bin/env bash
set -e
cd /var/www/html

# --- デバッグ出力ここから ---
echo "[debug] PWD=$(pwd)"
echo "[debug] WEBROOT=$WEBROOT"
echo "[debug] DOCUMENT_ROOT=$DOCUMENT_ROOT"
echo "[debug] ls -al /var/www/html:"
ls -al /var/www/html || true
echo "[debug] ls -al /var/www/html/public:"
ls -al /var/www/html/public || true
# --- デバッグ出力ここまで ---

mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache || true
chmod -R ug+rw storage bootstrap/cache || true

php artisan config:clear || true
php artisan route:clear || true
php artisan view:clear || true
php artisan key:generate --force || true
php artisan migrate --force || true
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

echo "[init] Laravel init done."
