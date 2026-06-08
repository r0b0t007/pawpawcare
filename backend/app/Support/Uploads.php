<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;

class Uploads
{
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
