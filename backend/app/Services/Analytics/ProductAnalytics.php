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
    /** @var array<int, array<string, mixed>> */
    private array $buffer = [];

    private bool $flushScheduled = false;

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

        if (! $this->flushScheduled) {
            $this->flushScheduled = true;
            app()->terminating(fn () => $this->flush());
        }
    }

    /** Send buffered events. Best-effort: failures are logged, never thrown. */
    public function flush(): void
    {
        $batch = $this->buffer;
        $this->buffer = [];
        $this->flushScheduled = false;
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
                'status' => method_exists($e, 'getCode') ? $e->getCode() : null,
            ]);
        }
    }

    /**
     * Permanently delete the person and their events (account purge). Returns
     * true when PostHog accepted the deletion (or, outside production, when
     * deletion isn't configured), false when it must be retried.
     *
     * Note: events are flushed on app()->terminating, i.e. per HTTP request or
     * console command. A long-running queue worker would need its own flush.
     */
    public function deletePerson(string $distinctId): bool
    {
        $personalKey = (string) config('services.posthog.personal_api_key');
        $projectId = (string) config('services.posthog.project_id');
        if ($personalKey === '' || $projectId === '') {
            // The app identifies users in PostHog under this same id whether or
            // not the server captures, so production must be able to erase it.
            // Elsewhere (local, CI) nothing real was ever sent.
            if (! app()->environment('production')) {
                return true;
            }
            Log::error('PostHog person deletion is not configured (POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID)');

            return false;
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

            return false;
        }

        // 202 with an empty deletion_errors list means accepted (or no such
        // person). Failures are reported in deletion_errors, not the status.
        if (! $response->successful() || ! empty($response->json('deletion_errors'))) {
            Log::warning('PostHog person deletion failed', ['status' => $response->status()]);

            return false;
        }

        return true;
    }
}
