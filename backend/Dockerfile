# ---- Runtime: nginx+php-fpm（richarvey）----
FROM richarvey/nginx-php-fpm:3.1.6

# 作業ディレクトリ（Root=backend なので "." は backend/ 配下のみ）
WORKDIR /var/www/html
COPY . .

# PostgreSQL用のPHP拡張を追加（コンテナ内のPHPで必須）
USER root
RUN apt-get update \
 && apt-get install -y libpq-dev \
 && docker-php-ext-install pdo pdo_pgsql pgsql \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Laravelのpublic（Root=backend のときは /var/www/html/public が正解）
ENV WEBROOT=/var/www/html/public

# /start.d/*.sh を有効化
ENV RUN_SCRIPTS=1 \
    PHP_ERRORS_STDERR=1 \
    REAL_IP_HEADER=1 \
    APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    COMPOSER_ALLOW_SUPERUSER=1

# 起動時の初期化（権限・キャッシュ・migrate）
COPY scripts/00-laravel-deploy.sh /start.d/00-laravel-deploy.sh
RUN chmod +x /start.d/00-laravel-deploy.sh

# 念のため明示（Renderのスキャンは80でOK）
EXPOSE 80

# ★ これが“ロック”：必ず /start.sh を起動（Start Command が空なら CMD が使われる）
CMD ["/start.sh"]
