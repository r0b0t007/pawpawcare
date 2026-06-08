<?php

return [
    // Signing secret. Mirrors the previous backend's SECRET_KEY env var,
    // falling back to the Laravel APP_KEY if unset.
    'secret' => env('SECRET_KEY', env('APP_KEY')),

    'algo' => env('JWT_ALGO', 'HS256'),

    // Access token lifetime, in minutes.
    'access_ttl' => (int) env('ACCESS_TOKEN_EXPIRE_MINUTES', 60),

    // Refresh token lifetime, in days.
    'refresh_ttl' => (int) env('REFRESH_TOKEN_EXPIRE_DAYS', 30),
];
