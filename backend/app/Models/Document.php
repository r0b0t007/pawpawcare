<?php

namespace App\Models;

use App\Support\Uploads;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Document extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected static function booted(): void
    {
        // Remove the stored file when the record is deleted via Eloquent.
        // (DB-level cascades on pet delete are handled in Pet::booted.)
        static::deleting(function (Document $doc) {
            Uploads::deletePrivate($doc->file_path);
        });
    }

    protected $fillable = [
        'pet_id', 'appointment_id', 'clinic_id', 'title', 'category', 'file_path', 'mime', 'size_bytes',
    ];

    protected $attributes = [
        'category' => 'other',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
        'extraction' => 'array',
        'extracted_at' => 'datetime',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function toApi(): array
    {
        // Note: the raw file_path is intentionally never exposed. Clients fetch a
        // short-lived signed URL from the `/documents/{id}/url` endpoint to view it.
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'appointment_id' => $this->appointment_id,
            'clinic_id' => $this->clinic_id,
            'title' => $this->title,
            'category' => $this->category,
            'mime' => $this->mime,
            'size_bytes' => $this->size_bytes,
            'extraction_status' => $this->extraction_status ?? 'none',
            'extraction' => $this->extraction,
            'extracted_at' => $this->extracted_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
