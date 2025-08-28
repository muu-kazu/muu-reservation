#!/usr/bin/env bash
set -euo pipefail

echo "Running composer"
composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader

# ★ 権限問題を避けるため、当面はキャッシュ生成しない
# php artisan config:cache
# php artisan route:cache

echo "Running migrations at runtime..."
php artisan migrate --force

# ここから本番プロセスを起動（例: php-fpm）
exec php-fpm
