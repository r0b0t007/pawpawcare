<?php

namespace App\Casts;

use App\Support\Uploads;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * An image url column (see Uploads::URL_COLUMNS): managed upload urls are
 * stored in their current form, so an old /storage/... value a client sends
 * back after the move to R2 matches what's stored (Uploads::canonicalUrl).
 */
class UploadUrl implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return Uploads::canonicalUrl($value === null ? null : (string) $value);
    }
}
