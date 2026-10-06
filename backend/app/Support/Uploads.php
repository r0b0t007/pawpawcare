<?php

namespace App\Support;

use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\Post;
use App\Models\Upload;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

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
    public static function storeImage(UploadedFile $file, string $ownerId): string
    {
        [$binary, $ext] = self::encodeImage($file);
        $path = self::randomPath('uploads', $ext);
        Storage::disk('public')->put($path, $binary);
        Upload::create(['path' => $path, 'user_id' => $ownerId]);

        return '/storage/'.$path;
    }

    /**
     * Guard for every client-supplied image URL field (avatars, post images,
     * lost-pet photos). Accepts an external http(s) URL, the field's current
     * value unchanged, or a `/storage/...` upload made by one of $uploaderIds.
     * Anything else — another user's upload, a hand-written or traversal-shaped
     * path — is a 422, so a record can never point at a file its owner may not
     * delete.
     *
     * @param  list<string>  $uploaderIds
     */
    public static function assertUsableUrl(?string $url, array $uploaderIds, ?string $current, string $field): void
    {
        if ($url === null || $url === '' || $url === $current || preg_match('#^https?://#i', $url)) {
            return;
        }

        $path = self::pathFromUrl($url);
        $owned = $path && Upload::where('path', $path)->whereIn('user_id', $uploaderIds)->exists();

        if (! $owned) {
            throw ValidationException::withMessages([$field => 'That image is not one of your uploads.']);
        }
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

    /**
     * Extract the public-disk path from a managed /storage/... url, or null.
     * Only the exact shape storeImage() generates is managed; anything else
     * (external, hand-written, traversal-shaped) is left alone.
     */
    public static function pathFromUrl(?string $url): ?string
    {
        if (! $url || ! preg_match('#^/storage/(uploads/[A-Za-z0-9]{40}\.(?:jpg|png|webp|gif))$#', $url, $m)) {
            return null;
        }

        return $m[1];
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

        try {
            if (! Upload::where('path', $path)->exists()) {
                return;
            }

            $stillReferenced = User::where('avatar_url', $url)->exists()
                || Pet::where('avatar_url', $url)->exists()
                || Post::where('image_url', $url)->exists()
                || LostPetReport::where('photo_url', $url)->exists();
            if ($stillReferenced) {
                return;
            }

            Storage::disk('public')->delete($path);
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
