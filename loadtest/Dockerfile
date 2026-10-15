# PHP-FPM build of the API, for load testing only.
#
# backend/Dockerfile serves with `php artisan serve`, which is PHP's built-in
# dev server: a SINGLE-THREADED process. Multiple workers need
# PHP_CLI_SERVER_WORKERS, which relies on fork() and is unavailable on Windows.
# Either way it is not what production runs. Load testing that target measures
# a queue of one, not concurrency.
#
# cPanel serves PHP through PHP-FPM, so this image does too. The worker pool
# size is the knob that decides how many requests are genuinely in flight at
# once — see PHP_FPM_MAX_CHILDREN in docker-compose.yml.
# 8.4, not 8.3: composer.json says php ^8.3, but composer.lock pins Symfony 8.1,
# which requires >=8.4.1. Matches backend/Dockerfile (php:8.4-cli).
FROM php:8.4-fpm

RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libzip-dev libonig-dev \
    && docker-php-ext-install pdo_mysql mbstring zip bcmath opcache \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist

COPY backend/ .
RUN composer dump-autoload --optimize

# php-fpm workers run as www-data, but COPY lands everything as root:root 755.
# Without this, CACHE_STORE=file cannot write throttle counters and EVERY
# rate-limited route 500s, while storage/logs stays unwritable so nothing is
# logged to explain why.
RUN chown -R www-data:www-data storage bootstrap/cache

# Production-shaped opcache. Without this every request recompiles the
# framework and you benchmark the compiler instead of the app.
RUN { \
      echo 'opcache.enable=1'; \
      echo 'opcache.validate_timestamps=0'; \
      echo 'opcache.memory_consumption=192'; \
      echo 'opcache.max_accelerated_files=20000'; \
    } > /usr/local/etc/php/conf.d/opcache.ini

COPY loadtest/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]
