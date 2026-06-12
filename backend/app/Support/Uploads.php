<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Uploads
{
    /** The private disk holding sensitive files (medical documents). */
    public const PRIVATE_DISK = 'local';

    // ── Public images (avatars, post photos) ─────────────────────────────────

    /**
     * Re-encode an uploaded image via GD (strips EXIF/metadata, guarantees the
     * bytes are a real image) and store it on the public disk. Returns the
     * relative /storage/... url. Aborts (422) if the file isn't a valid image.
     */
    public static function storeImage(UploadedFile $file, string $dir = 'uploads'): string
    {
        [$binary, $ext] = self::encodeImage($file);
        $path = self::randomPath($dir, $ext);
        Storage::disk('public')->put($path, $binary);

        return '/storage/'.$path;
    }

    // ── Private files (medical documents) ────────────────────────────────────

    /** Re-encode an image and store it on the private disk. Returns the disk path. */
    public static function storePrivateImage(UploadedFile $file, string $dir = 'documents'): string
    {
        [$binary, $ext] = self::encodeImage($file);

        return self::putPrivate($binary, $dir, $ext);
    }

    /** Store a verified PDF on the private disk. Returns the disk path. */
    public static function storePrivatePdf(UploadedFile $file, string $dir = 'documents'): string
    {
        return self::putPrivate(self::pdfBytes($file), $dir, 'pdf');
    }

    /** Delete a private-disk file by its stored path, if any. */
    public static function deletePrivate(?string $path): void
    {
        if ($path) {
            Storage::disk(self::PRIVATE_DISK)->delete($path);
        }
    }

    // ── Public-disk path helpers (used by the prune command) ─────────────────

    /** Extract the public-disk path from a managed /storage/... url (or null). */
    public static function pathFromUrl(?string $url): ?string
    {
        if (! $url || ! str_starts_with($url, '/storage/')) {
            return null; // external or non-managed URL — leave it alone
        }

        return substr($url, strlen('/storage/'));
    }

    /** Delete the file behind a managed /storage/... url, if any. */
    public static function deleteByUrl(?string $url): void
    {
        $path = self::pathFromUrl($url);
        if ($path) {
            Storage::disk('public')->delete($path);
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

    private static function putPrivate(string $binary, string $dir, string $ext): string
    {
        $path = self::randomPath($dir, $ext);
        Storage::disk(self::PRIVATE_DISK)->put($path, $binary);

        return $path;
    }

    private static function randomPath(string $dir, string $ext): string
    {
        return trim($dir, '/').'/'.Str::random(40).'.'.$ext;
    }
}
