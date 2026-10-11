<?php

namespace App\Support;

use RuntimeException;
use Spatie\Backup\Enums\Encryption;

/**
 * Guards for nightly backups. Backups hold pets' medical records, so they
 * never run half-configured, never to a disk the web can reach, and never
 * unencrypted: spatie/laravel-backup silently writes a plain zip when the
 * password is empty or ext-zip lacks AES, so assertEncryptable() also runs
 * inside every backup (AppServiceProvider), manual `backup:run` included.
 */
class Backups
{
    /** The only destinations allowed: the private R2 bucket, or a local disk outside every backup source and the web root. */
    public const DISKS = ['backups', 'backups-local'];

    /** `openssl rand -base64 33` gives 44 characters; WinZip AES's key stretching is weak, so short passwords are refused. */
    public const MIN_PASSWORD_LENGTH = 24;

    /** What's missing for the destination alone — enough for backup:clean to keep enforcing retention. */
    public static function destinationMissing(): array
    {
        $disk = self::disk();

        if (! in_array($disk, self::DISKS, true)) {
            return ['BACKUP_DISK'];
        }

        if ($disk !== 'backups') {
            return [];
        }

        $required = [
            'BACKUP_R2_BUCKET' => config('filesystems.disks.backups.bucket'),
            'BACKUP_R2_ENDPOINT' => config('filesystems.disks.backups.endpoint'),
            'BACKUP_R2_ACCESS_KEY_ID' => config('filesystems.disks.backups.key'),
            'BACKUP_R2_SECRET_ACCESS_KEY' => config('filesystems.disks.backups.secret'),
        ];

        return array_keys(array_filter($required, fn ($value) => trim((string) $value) === ''));
    }

    /** Everything that stops a backup from running, for the "not configured" error. */
    public static function missing(): array
    {
        return [...self::encryptionMissing(), ...self::destinationMissing(), ...self::separationMissing()];
    }

    /**
     * New archives stay apart from the uploads: in the public media bucket
     * they'd be downloadable, and one shared key could delete both the live
     * files and their backups. Not part of destinationMissing(), so cleanup
     * keeps enforcing retention (the 90-day privacy promise) meanwhile.
     */
    private static function separationMissing(): array
    {
        if (self::disk() !== 'backups') {
            return [];
        }
        $uploads = array_keys(UploadsBackup::DIRS);
        $missing = [];

        $buckets = array_filter(array_map(fn ($d) => config("filesystems.disks.{$d}.bucket"), $uploads));
        if (in_array(config('filesystems.disks.backups.bucket'), $buckets, true)) {
            $missing[] = 'BACKUP_R2_BUCKET (must not be an upload bucket)';
        }
        $keys = array_filter(array_map(fn ($d) => config("filesystems.disks.{$d}.key"), $uploads));
        if (in_array(config('filesystems.disks.backups.key'), $keys, true)) {
            $missing[] = 'BACKUP_R2_ACCESS_KEY_ID (must not be the uploads key)';
        }

        return $missing;
    }

    public static function ready(): bool
    {
        return self::missing() === [];
    }

    public static function destinationReady(): bool
    {
        return self::destinationMissing() === [];
    }

    /** Throws before anything is zipped unless the archive will really be AES-256 encrypted to an allowed disk. */
    public static function assertEncryptable(): void
    {
        if ($missing = self::missing()) {
            throw new RuntimeException('Refusing to back up: missing or invalid '.implode(', ', $missing));
        }
    }

    private static function encryptionMissing(): array
    {
        $missing = [];

        if (mb_strlen(trim((string) config('backup.backup.password'))) < self::MIN_PASSWORD_LENGTH) {
            $missing[] = 'BACKUP_ARCHIVE_PASSWORD';
        }

        if (config('backup.backup.encryption') !== 'aes256' || Encryption::Aes256->algorithm() === null) {
            $missing[] = 'AES-256 zip support (ext-zip built with libzip encryption)';
        }

        return $missing;
    }

    private static function disk(): string
    {
        return (string) config('backup.backup.destination.disks.0');
    }
}
