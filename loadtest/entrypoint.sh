#!/bin/sh
set -e

# The worker pool is the whole point of this stack: it is the number of
# requests PHP will genuinely process at once. CloudLinux (what Namecheap
# shared hosting runs) caps this per account as the "entry processes" limit,
# default 20. Set PHP_FPM_MAX_CHILDREN to your real cPanel EP number to model
# production, or raise it to find the app's own ceiling.
MAX_CHILDREN="${PHP_FPM_MAX_CHILDREN:-20}"

cat > /usr/local/etc/php-fpm.d/zz-loadtest.conf <<CONF
[www]
; Static, not dynamic: a pool that grows mid-test makes results
; non-reproducible, because run 2 starts with workers run 1 had to spawn.
pm = static
pm.max_children = ${MAX_CHILDREN}
pm.max_requests = 0
CONF

echo "php-fpm: pm=static pm.max_children=${MAX_CHILDREN}"

# Belt and braces on top of the compose healthcheck: wait for a real TCP
# connection that can actually run a query before migrating.
echo "waiting for ${DB_HOST}:${DB_PORT} ..."
i=0
until php -r '
    $h = getenv("DB_HOST"); $p = (int) getenv("DB_PORT");
    $u = getenv("DB_USERNAME"); $w = getenv("DB_PASSWORD"); $d = getenv("DB_DATABASE");
    try { new PDO("mysql:host=$h;port=$p;dbname=$d", $u, $w); exit(0); }
    catch (Throwable $e) { exit(1); }
' 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "database never became reachable after ${i} attempts" >&2
    exit 1
  fi
  sleep 2
done
echo "database reachable after ${i} attempt(s)"

php artisan migrate --force
php artisan config:cache
php artisan route:cache

exec "$@"
