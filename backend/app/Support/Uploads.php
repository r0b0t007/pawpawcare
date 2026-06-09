<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Uploads
{
    /**
     * Re-encode an uploaded image via GD (strips EXIF/metadata, guarantees the
     * bytes are a real image) and store it on the public disk. Returns the
     * relative /storage/... url. Aborts (422) if the file isn't a valid image.
     */
    public static function storeImage(UploadedFile $file, string $dir = 'uploads'): string
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

        return self::put($binary, $dir, $ext);
    }

    /**
     * Store a PDF as-is after confirming it really is one (magic bytes), so a
     * mislabelled binary can't be smuggled in. Returns the relative url.
     */
    public static function storePdf(UploadedFile $file, string $dir = 'documents'): string
    {
        $bytes = (string) file_get_contents($file->getRealPath());
        if (! str_starts_with($bytes, '%PDF-')) {
            abort(422, 'The file is not a valid PDF.');
        }

        return self::put($bytes, $dir, 'pdf');
    }

    /** Write raw bytes to a random path under $dir and return the /storage/... url. */
    private static function put(string $binary, string $dir, string $ext): string
    {
        $path = trim($dir, '/').'/'.Str::random(40).'.'.$ext;
        Storage::disk('public')->put($path, $binary);

        return '/storage/'.$path;
    }

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
}
