<?php

namespace App\Support;

use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\Post;
use App\Models\Upload;
use App\Models\User;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class Uploads
{
    /** Disks that may hold public images: local (served at /storage) or R2 (served at MEDIA_URL). */
    public const PUBLIC_DISKS = ['public', 'r2-media'];

    /** Disks that may hold medical documents: never web-accessible without a signed URL. */
    public const PRIVATE_DISKS = ['local', 'r2-documents'];

    /** A managed upload's path: a 40-char random name in uploads/ (see pathFromUrl). */
    private const MANAGED_PATH = 'uploads/[A-Za-z0-9]{40}\.[A-Za-z0-9]{2,5}';

    /**
     * Every column that can hold a public upload url. The models cast it with
     * App\Casts\UploadUrl; deletes, `uploads:prune` and `uploads:migrate`
     * all read references from here, so a new image column goes here only.
     */
    public const URL_COLUMNS = [
        User::class => 'avatar_url',
        Pet::class => 'avatar_url',
        Post::class => 'image_url',
        LostPetReport::class => 'photo_url',
    ];

    // ── Disks ────────────────────────────────────────────────────────────────

    public static function publicDiskName(): string
    {
        return self::diskName('public_disk', self::PUBLIC_DISKS);
    }

    public static function privateDiskName(): string
    {
        return self::diskName('private_disk', self::PRIVATE_DISKS);
    }

    public static function publicDisk(): Filesystem
    {
        return Storage::disk(self::publicDiskName());
    }

    /** The disk holding sensitive files (medical documents). */
    public static function privateDisk(): Filesystem
    {
        return Storage::disk(self::privateDiskName());
    }

    // ── Public images (avatars, post photos) ─────────────────────────────────

    /**
     * Re-encode an uploaded image via GD (strips EXIF/metadata, guarantees the
     * bytes are a real image) and store it on the public disk. Returns its
     * url (see publicUrl). Aborts (422) if the file isn't a valid image.
     */
    public static function storeImage(UploadedFile $file, string $ownerId): string
    {
        [$binary, $ext] = self::encodeImage($file);
        $path = self::randomPath('uploads', $ext);
        $url = self::publicUrl($path); // before the write: a missing MEDIA_URL stores nothing
        self::publicDisk()->put($path, $binary);
        Upload::create(['path' => $path, 'user_id' => $ownerId]);

        return $url;
    }

    /**
     * The url stored for a public-disk path: relative /storage/... on the
     * local disk (the app resolves it against its API base), absolute
     * MEDIA_URL/... on R2.
     */
    public static function publicUrl(string $path): string
    {
        if (self::publicDiskName() === 'public') {
            return '/storage/'.$path;
        }
        $base = self::mediaBase();
        if ($base === null) {
            throw new \RuntimeException('MEDIA_URL must be set when uploads use the r2-media disk.');
        }

        return $base.'/'.$path;
    }

    /**
     * A managed upload url in its current form, so an old /storage/... value
     * a client sends back becomes MEDIA_URL/... once images are on R2 (and
     * matches what's stored). Anything else is returned unchanged. Never
     * throws: a misconfigured disk must not block saving a record.
     */
    public static function canonicalUrl(?string $url): ?string
    {
        $path = self::pathFromUrl($url);
        if ($path === null) {
            return $url;
        }

        try {
            return self::publicUrl($path);
        } catch (\RuntimeException) {
            return $url;
        }
    }

    /**
     * Guard for every client-supplied image URL field (avatars, post images,
     * lost-pet photos). Accepts the field's current value unchanged (in
     * either url form), an upload made by one of $uploaderIds, or an
     * external http(s) URL. Anything else — another user's upload (also by
     * its MEDIA_URL address), a hand-written or traversal-shaped path — is a
     * 422, so a record can never point at a file its owner may not delete.
     *
     * The media host is never "external": a lookalike of a managed url there
     * (other case, port, query string) or one staged before MEDIA_URL is set
     * would otherwise keep another user's deleted photo referenced.
     *
     * @param  list<string>  $uploaderIds
     */
    public static function assertUsableUrl(?string $url, array $uploaderIds, ?string $current, string $field): void
    {
        if ($url === null || $url === '' || self::canonicalUrl($url) === self::canonicalUrl($current)) {
            return;
        }

        $path = self::pathFromUrl($url);
        if ($path === null && self::isExternalUrl($url)) {
            return;
        }

        $owned = $path && Upload::where('path', $path)->whereIn('user_id', $uploaderIds)->exists();

        if (! $owned) {
            throw ValidationException::withMessages([$field => 'That image is not one of your uploads.']);
        }
    }

    // ── Private files (medical documents) ────────────────────────────────────

    /**
     * Re-encode an image and store it on the private disk.
     *
     * @return array{0: string, 1: int} [disk path, stored size in bytes]
     */
    public static function storePrivateImage(UploadedFile $file, string $dir = 'documents'): array
    {
        [$binary, $ext] = self::encodeImage($file);

        return self::putPrivate($binary, $dir, $ext);
    }

    /**
     * Store a verified PDF on the private disk.
     *
     * @return array{0: string, 1: int} [disk path, stored size in bytes]
     */
    public static function storePrivatePdf(UploadedFile $file, string $dir = 'documents'): array
    {
        return self::putPrivate(self::pdfBytes($file), $dir, 'pdf');
    }

    /**
     * Delete a private-disk file by its stored path, if any. Deferred until
     * the surrounding transaction commits (immediate when there is none), so
     * a rolled-back delete never leaves rows pointing at missing files.
     */
    public static function deletePrivate(?string $path): void
    {
        if ($path) {
            // Never throws: R2 can fail where the local disk didn't, and one
            // failure must not abort a pet delete or skip the purge's other
            // deletes. `uploads:prune` removes anything left behind.
            DB::afterCommit(function () use ($path) {
                try {
                    self::privateDisk()->delete($path);
                } catch (\Throwable $e) {
                    report($e);
                }
            });
        }
    }

    // ── Public-disk path helpers (used by the prune command) ─────────────────

    /**
     * Extract the public-disk path from a managed upload url, or null: the
     * /storage/... form, or MEDIA_URL/... when MEDIA_URL is set. Only the
     * shape the app generates is managed — a 40-char random name in uploads/
     * (storeImage() today; Laravel's hashName() for older uploads, whose
     * extension could be e.g. .jpeg or .bmp). Anything else (external,
     * hand-written, traversal-shaped) is left alone.
     */
    public static function pathFromUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        foreach (array_filter(['/storage', self::mediaBase()]) as $prefix) {
            if (preg_match('#^'.preg_quote($prefix, '#').'/('.self::MANAGED_PATH.')$#', $url, $m)) {
                return $m[1];
            }
        }

        return null;
    }

    /**
     * Every url a record may hold for this path: rows written before the move
     * to R2 keep /storage/... until `uploads:migrate` rewrites them.
     *
     * @return list<string>
     */
    public static function urlForms(string $path): array
    {
        $base = self::mediaBase();

        return $base === null ? ['/storage/'.$path] : ['/storage/'.$path, $base.'/'.$path];
    }

    /**
     * The upload a stored url references, for `uploads:prune`: the
     * /storage/... form, or any url on a media host (MEDIA_HOST or MEDIA_URL's)
     * ending in /uploads/<name>. Not tied to the exact MEDIA_URL, so a
     * changed or missing MEDIA_URL can't make every image look unreferenced;
     * not any host either, or an external url ending in someone's file name
     * would keep that file forever. Media-host urls can only be stored as
     * owned uploads (assertUsableUrl never accepts them as external).
     */
    public static function referencedPath(?string $url): ?string
    {
        if (! $url) {
            return null;
        }
        if (preg_match('#^/storage/('.self::MANAGED_PATH.')$#', $url, $m)) {
            return $m[1];
        }

        return self::isMediaHost($url) && preg_match('#^https?://[^/?\#\\\\]+(?:/[^?\#\\\\]*)?/('.self::MANAGED_PATH.')$#i', $url, $m)
            ? $m[1] : null;
    }

    /**
     * Best-effort removal of a managed upload once nothing references it any
     * more. Call only after the owning write (updated/deleted hooks), so the
     * changed record no longer points at the file. Files with no ownership row
     * (pre-dating the uploads table) are left to `uploads:prune`. Never throws:
     * a cleanup failure must not block deleting or editing the record.
     */
    public static function deleteIfOrphaned(?string $url): void
    {
        $path = self::pathFromUrl($url);
        if (! $path) {
            return;
        }

        // After commit (immediate when there's no transaction): the reference
        // check then sees the committed state, and a rollback keeps the file.
        DB::afterCommit(fn () => self::deleteIfUnreferenced($path));
    }

    private static function deleteIfUnreferenced(string $path): void
    {
        try {
            if (! Upload::where('path', $path)->exists()) {
                return;
            }

            // Compared in PHP too: MySQL's case- and accent-insensitive
            // collation would let a lookalike url count as a reference.
            $urls = self::urlForms($path);
            foreach (self::URL_COLUMNS as $model => $column) {
                if ($model::whereIn($column, $urls)->pluck($column)->contains(fn ($v) => in_array($v, $urls, true))) {
                    return; // still in use
                }
            }

            self::publicDisk()->delete($path);
            Upload::where('path', $path)->delete();
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ── Internals ────────────────────────────────────────────────────────────

    /** @return array{0: string, 1: string} re-encoded [binary, extension]. Aborts (422) if not an image. */
    private static function encodeImage(UploadedFile $file): array
    {
        $image = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if ($image === false) {
            abort(422, 'The file could not be read as an image.');
        }
        imagepalettetotruecolor($image);

        ob_start();
        switch ($file->getMimeType()) {
            case 'image/png':
                imagealphablending($image, false);
                imagesavealpha($image, true);
                imagepng($image, null, 6);
                $ext = 'png';
                break;
            case 'image/webp':
                if (function_exists('imagewebp')) {
                    imagewebp($image, null, 85);
                    $ext = 'webp';
                } else {
                    imagejpeg($image, null, 85);
                    $ext = 'jpg';
                }
                break;
            case 'image/gif':
                imagegif($image); // note: re-encode keeps the first frame only
                $ext = 'gif';
                break;
            default:
                imagejpeg($image, null, 85);
                $ext = 'jpg';
        }
        $binary = (string) ob_get_clean();
        imagedestroy($image);

        return [$binary, $ext];
    }

    /** Read a PDF's bytes after confirming the magic header. Aborts (422) otherwise. */
    private static function pdfBytes(UploadedFile $file): string
    {
        $bytes = (string) file_get_contents($file->getRealPath());
        if (! str_starts_with($bytes, '%PDF-')) {
            abort(422, 'The file is not a valid PDF.');
        }

        return $bytes;
    }

    /** @return array{0: string, 1: int} [disk path, size]: the size is known here, so no read-back from R2. */
    private static function putPrivate(string $binary, string $dir, string $ext): array
    {
        $path = self::randomPath($dir, $ext);
        self::privateDisk()->put($path, $binary);

        return [$path, strlen($binary)];
    }

    /** @param  list<string>  $allowed */
    private static function diskName(string $key, array $allowed): string
    {
        $name = (string) config("filesystems.uploads.{$key}");
        if (! in_array($name, $allowed, true)) {
            throw new \RuntimeException("filesystems.uploads.{$key} must be one of ".implode(', ', $allowed).", not '{$name}'.");
        }

        return $name;
    }

    /**
     * An image url from another site that a record may point at as-is.
     * Strict on purpose: browsers and the app's URL parser fold backslashes,
     * tabs, percent-escapes and fullwidth dots into a host that PHP's
     * parse_url reads differently, so anything that could parse two ways is
     * refused, and so is the media host (see assertUsableUrl).
     */
    private static function isExternalUrl(string $url): bool
    {
        if (! preg_match('#^https?://#i', $url) || preg_match('#[\x00-\x20\x7f\\\\]#', $url)) {
            return false;
        }
        $host = parse_url($url, PHP_URL_HOST);

        return is_string($host) && preg_match('#^[A-Za-z0-9.-]+$#', $host) && ! self::isMediaHost($url);
    }

    /** Whether a url is on the host our media is (or will be) served from. */
    private static function isMediaHost(string $url): bool
    {
        $host = strtolower(rtrim((string) parse_url(str_replace('\\', '/', $url), PHP_URL_HOST), '.'));
        $hosts = array_filter([
            strtolower((string) config('filesystems.uploads.media_host')),
            strtolower((string) parse_url((string) self::mediaBase(), PHP_URL_HOST)),
        ]);

        return $host !== '' && in_array($host, $hosts, true);
    }

    /** MEDIA_URL without a trailing slash, or null when unset. */
    private static function mediaBase(): ?string
    {
        $base = rtrim((string) config('filesystems.disks.r2-media.url'), '/');

        return $base === '' ? null : $base;
    }

    private static function randomPath(string $dir, string $ext): string
    {
        return trim($dir, '/').'/'.Str::random(40).'.'.$ext;
    }
}
