<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Server-side product analytics (App\Services\Analytics\ProductAnalytics).
    // `key` is the public project token (same phc_ key the app ships); empty
    // disables capture. The personal API key (scope person:write only) and
    // project id are needed solely to delete a purged user's data.
    'posthog' => [
        'key' => env('POSTHOG_PROJECT_KEY'),
        'host' => env('POSTHOG_HOST', 'https://us.i.posthog.com'),
        'api_host' => env('POSTHOG_API_HOST', 'https://us.posthog.com'),
        'personal_api_key' => env('POSTHOG_PERSONAL_API_KEY'),
        'project_id' => env('POSTHOG_PROJECT_ID'),
    ],

    // RevenueCat subscriptions. `webhook_auth` is the exact Authorization
    // header value configured on the RevenueCat webhook (empty = the webhook
    // refuses everything). The v2 secret key (sk_) and project id are used by
    // the API sync (D2).
    'revenuecat' => [
        'webhook_auth' => env('REVENUECAT_WEBHOOK_AUTH'),
        'secret_key' => env('REVENUECAT_SECRET_KEY'),
        'project_id' => env('REVENUECAT_PROJECT_ID'),
    ],

    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-opus-4-8'),
    ],

    // Social sign-in. `google.client_id` is the Google *Web* OAuth client ID —
    // it's the audience of the ID token minted by @react-native-google-signin
    // (which is configured with the same value as its webClientId). `apple.bundle_id`
    // is the app's bundle identifier, which is the audience of the identity
    // token from the native Sign in with Apple flow.
    'google' => [
        'client_id' => env('GOOGLE_WEB_CLIENT_ID'),
    ],

    'apple' => [
        'bundle_id' => env('APPLE_BUNDLE_ID', 'com.pawpawcare.app'),
    ],

    // AI document intake provider. `anthropic` (default) uses the block above;
    // `openai-compatible` points the three settings below at any Chat
    // Completions vision endpoint (Qwen/DashScope, Kimi/Moonshot, OpenRouter…).
    'extraction' => [
        'provider' => env('EXTRACTION_PROVIDER', 'anthropic'),
        'base_url' => env('EXTRACTION_BASE_URL'),
        'model' => env('EXTRACTION_MODEL'),
        'key' => env('EXTRACTION_API_KEY'),
    ],

];
