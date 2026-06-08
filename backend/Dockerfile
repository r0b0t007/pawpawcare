# PawPawCare Laravel API
FROM php:8.4-cli

# System deps + PHP extensions needed by Laravel + MySQL
RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libzip-dev libonig-dev \
    && docker-php-ext-install pdo_mysql mbstring zip bcmath \
    && rm -rf /var/lib/apt/lists/*

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Install PHP dependencies first (better layer caching)
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist

# App source
COPY . .
RUN composer dump-autoload --optimize

EXPOSE 8000

# Migrate + seed on boot, then serve. DB connection comes from env.
CMD php artisan migrate --force --seed \
    && php artisan serve --host=0.0.0.0 --port=8000
