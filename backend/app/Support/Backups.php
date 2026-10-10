<?php

namespace App\Support;

/**
 * Whether nightly backups can run. Backups hold pets' medical records, so they
 * never run half-configured: no R2 bucket means nowhere to put them, and no
 * archive password would mean shipping them unencrypted. routes/console.php
 * schedules them only when ready() and otherwise logs an error every night.
 */
class Backups
{
    /** Env keys that are missing or empty, for the "not configured" error. */
    public static function missing(): array
    {
        $disk = (string) config('backup.backup.destination.disks.0');

        $required = [
            'BACKUP_ARCHIVE_PASSWORD' => config('backup.backup.password'),
        ];

        // A non-R2 disk (e.g. `local` while testing a restore) needs no keys.
        if ($disk === 'backups') {
            $required += [
                'BACKUP_R2_BUCKET' => config('filesystems.disks.backups.bucket'),
                'BACKUP_R2_ENDPOINT' => config('filesystems.disks.backups.endpoint'),
                'BACKUP_R2_ACCESS_KEY_ID' => config('filesystems.disks.backups.key'),
                'BACKUP_R2_SECRET_ACCESS_KEY' => config('filesystems.disks.backups.secret'),
            ];
        } elseif (! is_array(config("filesystems.disks.{$disk}"))) {
            $required['BACKUP_DISK'] = null;
        }

        return array_keys(array_filter($required, fn ($value) => trim((string) $value) === ''));
    }

    public static function ready(): bool
    {
        return self::missing() === [];
    }
}
