<?php

/*
 * Subscription gating. Everything is OFF by default: every feature stays free
 * until these are switched on in the server .env (then `php artisan
 * config:cache`). The app learns the current state from GET /users/me
 * (`plan` + `features`), so flips need no app update.
 *
 * Features in App\Services\Subscriptions\Entitlements::NEVER_GATED (pets,
 * records, export, basic sharing, account deletion, data access) can never be
 * gated, whatever is configured here.
 */

$list = fn (?string $csv) => array_values(array_filter(array_map('trim', explode(',', (string) $csv))));
// env() only converts "true"/"false"; "off", "no", "0" must also mean off.
$flag = fn (string $key) => filter_var(env($key, false), FILTER_VALIDATE_BOOLEAN);

return [

    // Master switch. Off = no feature is gated for anyone.
    'paywall_enabled' => $flag('PAYWALL_ENABLED'),

    // Who sees the subscription UI (paywall, Profile → Subscription):
    // off | admins | all.
    'subscriptions_visible' => env('SUBSCRIPTIONS_VISIBLE', 'off'),

    // The RevenueCat entitlement (lookup key) that unlocks gated features.
    'entitlement' => env('SUBSCRIPTION_ENTITLEMENT', 'plus'),

    // Accounts created before this date (Y-m-d) keep gated features free.
    'grandfather_before' => env('PAYWALL_GRANDFATHER_BEFORE'),

    // Per-feature gates (only effective while paywall_enabled is on).
    'gates' => [
        'ai_extraction' => $flag('GATE_AI_EXTRACTION'),
        'care_links' => $flag('GATE_CARE_LINKS'),
    ],

    // Free AI document reads per calendar month (per pet owner) while the
    // ai_extraction gate is on. 0 = none. Counted in feature_usage, so
    // deleting documents doesn't give reads back.
    'free_ai_extractions' => (int) env('FREE_AI_EXTRACTIONS', 0),

    // User ids (our UUIDs) whose SANDBOX / test-store purchases count — the
    // App Review demo account. Everyone else's sandbox purchases are recorded
    // but never unlock anything.
    'sandbox_user_ids' => $list(env('REVENUECAT_SANDBOX_USER_IDS')),

];
