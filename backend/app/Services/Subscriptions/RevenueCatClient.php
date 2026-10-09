<?php

namespace App\Services\Subscriptions;

use App\Services\Analytics\ProductAnalytics;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * RevenueCat REST API v2 (Bearer secret key, sk_…), read + customer delete.
 * Customer Information endpoints allow 480 requests/minute per key.
 *
 * Needs REVENUECAT_SECRET_KEY with customer_information:subscriptions:read,
 * customer_information:purchases:read and customer_information:customers:read_write,
 * plus REVENUECAT_PROJECT_ID.
 */
class RevenueCatClient
{
    private const BASE = 'https://api.revenuecat.com';

    /** Pages followed per list (100 items each) — far beyond one customer's purchases. */
    private const MAX_PAGES = 5;

    // Same result codes as ProductAnalytics::deletePerson (account purge).
    public const DELETE_OK = ProductAnalytics::DELETE_OK;

    public const DELETE_PERSON_FAILED = ProductAnalytics::DELETE_PERSON_FAILED;

    public const DELETE_UNAVAILABLE = ProductAnalytics::DELETE_UNAVAILABLE;

    /** Whether the last failure was an outage / misconfiguration (vs. one customer). */
    private bool $outage = false;

    public function lastFailureWasOutage(): bool
    {
        return $this->outage;
    }

    public function configured(): bool
    {
        return (string) config('services.revenuecat.secret_key') !== ''
            && (string) config('services.revenuecat.project_id') !== '';
    }

    /**
     * The customer's subscriptions and one-time purchases (both environments),
     * or null when RevenueCat can't be reached / rejects the key. A customer
     * RevenueCat has never seen has none of either.
     *
     * @return array{subscriptions: array<int, array>, purchases: array<int, array>}|null
     */
    public function customerAccess(string $appUserId): ?array
    {
        $this->outage = false;
        if (! $this->configured()) {
            $this->outage = true;

            return null;
        }

        $base = $this->customerPath($appUserId);
        $subscriptions = $this->list("{$base}/subscriptions");
        if ($subscriptions === null) {
            return null;
        }
        $purchases = $subscriptions === false ? [] : $this->list("{$base}/purchases");
        if ($purchases === null) {
            return null;
        }

        return [
            'subscriptions' => $subscriptions === false ? [] : $subscriptions,
            'purchases' => $purchases === false ? [] : $purchases,
        ];
    }

    /**
     * Delete the customer (account purge). Deleting does NOT cancel store
     * billing — that stays with the user's Apple / Google account.
     */
    public function deleteCustomer(string $appUserId): string
    {
        if (! $this->configured()) {
            // Nothing to erase if RevenueCat never heard of this user (no
            // webhook named them, no entitlement). Otherwise production must
            // be able to delete them.
            $known = DB::table('revenuecat_event_users')->where('user_id', $appUserId)->exists()
                || DB::table('user_entitlements')->where('user_id', $appUserId)->exists();
            if (! $known || ! app()->environment('production')) {
                return self::DELETE_OK;
            }
            Log::error('RevenueCat customer deletion is not configured (REVENUECAT_SECRET_KEY / REVENUECAT_PROJECT_ID)');

            return self::DELETE_UNAVAILABLE;
        }

        try {
            $response = $this->http()->delete(self::BASE.$this->customerPath($appUserId));
        } catch (\Throwable $e) {
            Log::warning('RevenueCat customer deletion failed', ['error' => class_basename($e)]);

            return self::DELETE_UNAVAILABLE;
        }

        if ($response->successful()) {
            return self::DELETE_OK; // queued
        }
        if ($response->status() === 404) {
            // Never existed — but only if the project itself is right.
            return $this->projectExists() ? self::DELETE_OK : self::DELETE_UNAVAILABLE;
        }
        if ($this->unavailable($response, 'customer deletion')) {
            return self::DELETE_UNAVAILABLE;
        }
        Log::warning('RevenueCat customer deletion failed', ['status' => $response->status()]);

        return self::DELETE_PERSON_FAILED;
    }

    /**
     * Every item of a paginated list; false when the customer doesn't exist
     * (404); null when unavailable.
     *
     * @return array<int, array>|false|null
     */
    private function list(string $path): array|false|null
    {
        $items = [];
        $next = $path.'?limit=100';
        $prefix = $path.'?';
        for ($page = 0; $next !== null && $page < self::MAX_PAGES; $page++) {
            try {
                $response = $this->http()->get(self::BASE.$next);
            } catch (\Throwable $e) {
                Log::warning('RevenueCat request failed', ['error' => class_basename($e)]);
                $this->outage = true;

                return null;
            }
            if ($response->status() === 404) {
                // "No such customer" — unless it's the project that's wrong,
                // which must not read as "nobody has bought anything".
                if ($this->projectExists()) {
                    return false;
                }
                $this->outage = true;

                return null;
            }
            if (! $response->successful()) {
                $this->outage = $this->unavailable($response, 'customer lookup');
                $this->outage || Log::warning('RevenueCat customer lookup failed', ['status' => $response->status()]);

                return null;
            }
            $body = $response->json();
            if (! is_array($body) || ! is_array($body['items'] ?? null)) {
                Log::warning('RevenueCat returned an unexpected response');

                return null;
            }
            array_push($items, ...array_values(array_filter($body['items'], 'is_array')));

            // next_page continues this same list on the same host; never
            // follow anything else.
            $next = is_string($body['next_page'] ?? null) && str_starts_with($body['next_page'], $prefix)
                ? $body['next_page']
                : null;
        }

        return $items;
    }

    /**
     * Whether REVENUECAT_PROJECT_ID names a project this key can read
     * (cached for a day once confirmed). False when RevenueCat can't say.
     */
    private function projectExists(): bool
    {
        $cacheKey = 'revenuecat:project-ok:'.md5((string) config('services.revenuecat.project_id'));
        if (Cache::get($cacheKey) === true) {
            return true;
        }
        try {
            $project = rawurlencode((string) config('services.revenuecat.project_id'));
            $response = $this->http()->get(self::BASE."/v2/projects/{$project}/customers?limit=1");
        } catch (\Throwable) {
            return false;
        }
        if ($response->successful()) {
            Cache::put($cacheKey, true, 86400);

            return true;
        }
        if ($response->status() === 404) {
            Log::error('RevenueCat project not found; check REVENUECAT_PROJECT_ID');
        }

        return false;
    }

    /** Outage / configuration problems; logged here. */
    private function unavailable(Response $response, string $what): bool
    {
        $status = $response->status();
        if ($status === 429 || $response->serverError()) {
            Log::warning("RevenueCat {$what} failed", ['status' => $status]);

            return true;
        }
        if ($status === 401 || $status === 403) {
            Log::error("RevenueCat {$what} rejected; check REVENUECAT_SECRET_KEY permissions and REVENUECAT_PROJECT_ID", ['status' => $status]);

            return true;
        }

        return false;
    }

    private function customerPath(string $appUserId): string
    {
        $project = rawurlencode((string) config('services.revenuecat.project_id'));

        return "/v2/projects/{$project}/customers/".rawurlencode($appUserId);
    }

    private function http()
    {
        return Http::connectTimeout(5)->timeout(10)
            ->withoutRedirecting()
            ->withToken((string) config('services.revenuecat.secret_key'))
            ->acceptJson();
    }
}
