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
            Uploads::deleteByUrl($doc->file_url);
        });
    }

    protected $fillable = [
        'pet_id', 'appointment_id', 'clinic_id', 'title', 'category', 'file_url', 'mime', 'size_bytes',
    ];

    protected $attributes = [
        'category' => 'other',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'appointment_id' => $this->appointment_id,
            'clinic_id' => $this->clinic_id,
            'title' => $this->title,
            'category' => $this->category,
            'file_url' => $this->file_url,
            'mime' => $this->mime,
            'size_bytes' => $this->size_bytes,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
