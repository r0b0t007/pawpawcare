<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

        // Private Cloudflare R2 bucket for config/backup.php. The key pair is
        // an R2 token scoped to this one bucket (docs/backups.md). Endpoint:
        // https://<account-id>.r2.cloudflarestorage.com
        'backups' => [
            'driver' => 's3',
            'key' => env('BACKUP_R2_ACCESS_KEY_ID'),
            'secret' => env('BACKUP_R2_SECRET_ACCESS_KEY'),
            'region' => 'auto',
            'bucket' => env('BACKUP_R2_BUCKET'),
            'endpoint' => env('BACKUP_R2_ENDPOINT'),
            'use_path_style_endpoint' => true,
            // R2 rejects some of the AWS SDK's newer default checksum headers.
            'request_checksum_calculation' => 'when_required',
            'response_checksum_validation' => 'when_required',
            'visibility' => 'private',
            'throw' => true,
            'report' => false,
        ],

        // Uploads on Cloudflare R2 (docs/uploads-r2.md). One token for two
        // buckets: avatars and post/lost-pet photos, served publicly from
        // MEDIA_URL, and medical documents, which have no public URL and are
        // only reached through 5-minute presigned links. R2 has no object
        // ACLs, so 'private' only stops Flysystem asking for a public one.
        'r2-media' => [
            'driver' => 's3',
            'key' => env('UPLOADS_R2_ACCESS_KEY_ID'),
            'secret' => env('UPLOADS_R2_SECRET_ACCESS_KEY'),
            'region' => 'auto',
            'bucket' => env('UPLOADS_R2_MEDIA_BUCKET'),
            'endpoint' => env('UPLOADS_R2_ENDPOINT'),
            'url' => env('MEDIA_URL'),
            'use_path_style_endpoint' => true,
            'request_checksum_calculation' => 'when_required',
            'response_checksum_validation' => 'when_required',
            'visibility' => 'private',
            'throw' => true,
            'report' => false,
        ],

        'r2-documents' => [
            'driver' => 's3',
            'key' => env('UPLOADS_R2_ACCESS_KEY_ID'),
            'secret' => env('UPLOADS_R2_SECRET_ACCESS_KEY'),
            'region' => 'auto',
            'bucket' => env('UPLOADS_R2_DOCUMENTS_BUCKET'),
            'endpoint' => env('UPLOADS_R2_ENDPOINT'),
            'use_path_style_endpoint' => true,
            'request_checksum_calculation' => 'when_required',
            'response_checksum_validation' => 'when_required',
            'visibility' => 'private',
            'throw' => true,
            'report' => false,
        ],

        // Local backup target for restore drills / testing only. Outside
        // storage/app/private and /public, so archives are never served and
        // never nested inside later backups. Delete its contents afterwards.
        'backups-local' => [
            'driver' => 'local',
            'root' => storage_path('app/backups-local'),
            'visibility' => 'private',
            'throw' => true,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Upload Disks
    |--------------------------------------------------------------------------
    |
    | Where App\Support\Uploads keeps user files: 'public' + 'local' (the
    | default, also for dev and tests) or 'r2-media' + 'r2-documents'. After
    | switching, `php artisan uploads:migrate` moves the existing files over
    | (docs/uploads-r2.md). media_host is refused as an "external" image
    | host even before MEDIA_URL is set, so nobody can pre-stage references
    | to other users' photos there.
    |
    */

    'uploads' => [
        'public_disk' => env('UPLOADS_PUBLIC_DISK', 'public'),
        'private_disk' => env('UPLOADS_PRIVATE_DISK', 'local'),
        'media_host' => env('MEDIA_HOST', 'media.pawpawcare.app'),
        // Per account, across every pet it owns (Document::abortIfOverQuota).
        // Keep the bytes well under BACKUP_UPLOADS_MAX_MB, which holds every
        // account's documents at once.
        // An empty or 0 value means the default, never "refuse every upload".
        'documents_max_mb_per_account' => (int) env('DOCUMENTS_MAX_MB_PER_ACCOUNT') ?: 50,
        'documents_max_per_account' => (int) env('DOCUMENTS_MAX_PER_ACCOUNT') ?: 300,
    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
