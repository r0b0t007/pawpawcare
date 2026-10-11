<?php

namespace App\Console\Commands;

use App\Support\UploadsBackup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Deletes the backup staging folder a killed run left behind: the plain SQL
 * dump and the uploaded documents, unencrypted. spatie only empties it when
 * the next backup starts, and backups can stay off for a long time (not
 * configured, a stuck lock), so this runs daily whatever their state.
 */
class SweepBackupTemp extends Command
{
    protected $signature = 'backup:sweep-temp {--hours=6 : Only delete a folder untouched for this long}';

    protected $description = 'Delete unencrypted leftovers of a backup run that was killed.';

    public function handle(): int
    {
        $root = UploadsBackup::stagingRoot();

        // A run in progress keeps writing into it; only a folder nothing has
        // touched for hours is a leftover. A run that ends meanwhile deletes
        // the folder itself, which is just as good.
        try {
            $newest = filemtime($root);
            foreach (File::allFiles($root, true) as $file) {
                $newest = max($newest, $file->getMTime());
            }
        } catch (Throwable) {
            clearstatcache();
            if (is_dir($root)) {
                throw new \RuntimeException("Couldn't inspect {$root}.");
            }

            return self::SUCCESS;
        }
        if ($newest > now()->subHours((int) $this->option('hours'))->getTimestamp()) {
            $this->info('A backup may still be running; left alone.');

            return self::SUCCESS;
        }

        File::deleteDirectory($root);
        Log::warning('Deleted the leftovers of an interrupted backup run', ['path' => $root]);
        $this->info("Deleted {$root}.");

        return self::SUCCESS;
    }
}
