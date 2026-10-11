<?php

namespace App\Console\Commands;

use App\Support\Uploads;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Proves the upload disks work before a user finds out from a failed photo or
 * document upload: each R2 disk accepts a write, read and delete, public
 * media is actually served from MEDIA_URL, and document presigned URLs open.
 * deploy-backend.yml runs it after config:cache; a failure is also an error
 * log, so it reaches Sentry.
 */
class CheckUploads extends Command
{
    protected $signature = 'uploads:check';

    protected $description = 'Check that the configured upload disks (R2) accept files, serve media publicly and presign documents.';

    public function handle(): int
    {
        try {
            $disks = [Uploads::publicDiskName(), Uploads::privateDiskName()];
        } catch (\RuntimeException $e) {
            return $this->reportFailure($e->getMessage());
        }

        $remote = array_values(array_diff($disks, ['public', 'local']));
        if ($remote === []) {
            $this->info('Uploads use the local disks.');

            return self::SUCCESS;
        }

        foreach ($remote as $name) {
            if ($problem = $this->probe($name)) {
                return $this->reportFailure("{$name}: {$problem}");
            }
        }

        $this->info('Uploads OK ('.implode(' + ', $disks).').');

        return self::SUCCESS;
    }

    /** Write, read, fetch over HTTP and delete one small object; the problem, or null. */
    private function probe(string $name): ?string
    {
        $disk = Storage::disk($name);
        $key = 'health/upload-check-'.Str::random(20).'.txt';
        $body = 'PawPawCare upload check '.now()->toIso8601String();

        try {
            if ($name === 'r2-media' && ! str_starts_with(Uploads::publicUrl($key), 'https://')) {
                return 'MEDIA_URL must be an https:// address.';
            }

            $disk->put($key, $body);
            try {
                if ($disk->get($key) !== $body) {
                    return 'reading the test file back returned different bytes.';
                }

                // What the app and browsers will actually do with these files.
                [$url, $how] = $name === 'r2-media'
                    ? [Uploads::publicUrl($key), 'served from MEDIA_URL']
                    : [$disk->temporaryUrl($key, now()->addMinute()), 'opened through a presigned URL'];
                $response = Http::timeout(10)->get($url);
                if (! $response->successful() || $response->body() !== $body) {
                    return "the test file wasn't {$how} (HTTP {$response->status()}).";
                }
            } finally {
                $disk->delete($key);
            }
        } catch (\Throwable $e) {
            return $e->getMessage();
        }

        $this->info("{$name}: write, read, {$how} and delete OK.");

        return null;
    }

    private function reportFailure(string $reason): int
    {
        $this->error("Upload storage check failed: {$reason}");
        Log::error("Upload storage check failed: {$reason}");

        return self::FAILURE;
    }
}
