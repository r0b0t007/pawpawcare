<?php

namespace App\Services\Analytics;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Ramsey\Uuid\Uuid;

/**
 * Server-side product analytics (PostHog, US cloud) for outcomes only the
 * server sees — an extraction finishing, an export generated, an invite
 * accepted. Plain HTTP rather than posthog-php: the SDK's socket/fork
 * consumers are fragile on shared hosting, and two endpoints are all we need.
 *
 * Privacy rules (this app holds pet medical records):
 * - distinct_id is the user's UUID only (the app identifies with the same id,
 *   so server and app events join on one person);
 * - properties are enums and counts — never names, notes, record content,
 *   emails or URLs;
 * - GeoIP is disabled; users with analytics_opt_out are never captured.
 *
 * Events are buffered and sent in one /batch/ call after the response has
 * gone out (app()->terminating), with short timeouts and no retries: losing
 * an analytics event must never slow down or fail a request.
 */
class ProductAnalytics
{
    /** deletePerson(): PostHog accepted the deletion (or nothing to delete). */
    public const DELETE_OK = 'ok';

    /** deletePerson(): this person failed; retry them, keep going with others. */
    public const DELETE_PERSON_FAILED = 'person_failed';

    /** deletePerson(): PostHog is down or misconfigured; stop calling it this run. */
    public const DELETE_UNAVAILABLE = 'unavailable';

    /** @var array<int, array<string, mixed>> */
    private array $buffer = [];

    public function __construct()
    {
        // Registered once per instance (a singleton per request/command), so
        // repeated flushes never pile up terminating callbacks. Queued jobs
        // are flushed separately (Queue::after in AppServiceProvider).
        app()->terminating(fn () => $this->flush());
    }

    public function enabled(): bool
    {
        return (string) config('services.posthog.key') !== '';
    }

    /**
     * Queue an event for $user. $properties must be enums/counts only.
     * $dedupeKey gives the event a stable UUID so a retried source (e.g. a
     * re-delivered webhook) doesn't count twice.
     */
    public function capture(User $user, string $event, array $properties = [], ?string $dedupeKey = null): void
    {
        if (! $this->enabled() || $user->analytics_opt_out) {
            return;
        }

        $payload = [
            'event' => $event,
            'timestamp' => now()->toIso8601ZuluString('millisecond'),
            'properties' => array_merge($properties, [
                'distinct_id' => (string) $user->id,
                '$geoip_disable' => true,
                '$lib' => 'pawpawcare-api',
            ]),
        ];
        if ($dedupeKey !== null) {
            $payload['uuid'] = Uuid::uuid5(Uuid::NAMESPACE_URL, 'pawpawcare:'.$event.':'.$dedupeKey)->toString();
        }

        $this->buffer[] = $payload;
    }

    /** Send buffered events. Best-effort: failures are logged, never thrown. */
    public function flush(): void
    {
        $batch = $this->buffer;
        $this->buffer = [];
        if ($batch === [] || ! $this->enabled()) {
            return;
        }

        try {
            Http::connectTimeout(2)->timeout(3)
                ->post(rtrim((string) config('services.posthog.host'), '/').'/batch/', [
                    'api_key' => config('services.posthog.key'),
                    'batch' => $batch,
                ])
                ->throw();
        } catch (\Throwable $e) {
            Log::warning('PostHog capture failed', [
                'events' => count($batch),
                'error' => class_basename($e),
                'status' => $e->getCode(),
            ]);
        }
    }

    /**
     * Permanently delete the person and their events (account purge).
     * Returns DELETE_OK when PostHog accepted it (or, outside production, when
     * deletion isn't configured); DELETE_PERSON_FAILED when only this person
     * failed; DELETE_UNAVAILABLE when PostHog is down or misconfigured.
     *
     * Note: events are flushed per HTTP request / console command and after
     * each queued job; anything else long-running needs its own flush().
     */
    public function deletePerson(string $distinctId): string
    {
        $personalKey = (string) config('services.posthog.personal_api_key');
        $projectId = (string) config('services.posthog.project_id');
        if ($personalKey === '' || $projectId === '') {
            // The app identifies users in PostHog under this same id whether or
            // not the server captures, so production must be able to erase it.
            // Elsewhere (local, CI) nothing real was ever sent.
            if (! app()->environment('production')) {
                return self::DELETE_OK;
            }
            Log::error('PostHog person deletion is not configured (POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID)');

            return self::DELETE_UNAVAILABLE;
        }

        try {
            $response = Http::connectTimeout(5)->timeout(15)
                ->withToken($personalKey)
                ->post(rtrim((string) config('services.posthog.api_host'), '/')."/api/projects/{$projectId}/persons/bulk_delete/", [
                    'distinct_ids' => [$distinctId],
                    'delete_events' => true,
                    'delete_recordings' => true,
                ]);
        } catch (\Throwable $e) {
            Log::warning('PostHog person deletion failed', ['error' => class_basename($e)]);

            return self::DELETE_UNAVAILABLE;
        }

        $status = $response->status();
        if ($status === 429 || $response->serverError()) {
            Log::warning('PostHog person deletion failed', ['status' => $status]);

            return self::DELETE_UNAVAILABLE;
        }
        if ($response->clientError()) {
            // 401/403/404: wrong key scope or project id — a configuration
            // problem that won't fix itself, so surface it right away.
            Log::error('PostHog person deletion rejected; check POSTHOG_PERSONAL_API_KEY (person:write) and POSTHOG_PROJECT_ID', ['status' => $status]);

            return self::DELETE_UNAVAILABLE;
        }

        // Success is a 2xx that PostHog itself produced: a JSON body carrying
        // deletion_errors (a misconfigured host could answer 200 with HTML).
        // Per-person failures are reported in that list, not in the status.
        $errors = $response->json('deletion_errors');
        if (! $response->successful() || ! is_array($errors)) {
            Log::error('PostHog person deletion got an unexpected response; check POSTHOG_API_HOST', ['status' => $status]);

            return self::DELETE_UNAVAILABLE;
        }
        if ($errors !== []) {
            Log::warning('PostHog person deletion failed for one person', ['status' => $status]);

            return self::DELETE_PERSON_FAILED;
        }

        return self::DELETE_OK;
    }
}
