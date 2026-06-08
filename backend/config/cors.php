<?php

return [
    'paths' => ['*'],

    'allowed_methods' => ['*'],

    // Permissive by default so the Expo app (native + web) and tunnels can
    // reach the API. Override via ALLOWED_ORIGINS for a locked-down deployment.
    'allowed_origins' => env('ALLOWED_ORIGINS')
        ? array_map('trim', explode(',', env('ALLOWED_ORIGINS')))
        : ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // The client authenticates with Bearer tokens (not cookies), so credentials
    // are not required — this lets us keep a wildcard origin.
    'supports_credentials' => false,
];
