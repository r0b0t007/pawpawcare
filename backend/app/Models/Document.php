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

    /**
     * Abort with a 422 when one more file of $bytes would pass the storage
     * quota of the account $ownerId. Every pet an account owns shares one
     * quota, whoever uploads (a co-owner's uploads count against the owner),
     * so no single account can grow the documents bucket without limit. To
     * hold against parallel uploads, call it in a transaction whose first
     * statement locks the owner's users row (DocumentController::store).
     */
    public static function abortIfOverQuota(string $ownerId, int $bytes): void
    {
        $usage = static::whereIn('pet_id', Pet::where('owner_id', $ownerId)->select('id'))
            ->selectRaw('count(*) as files, coalesce(sum(size_bytes), 0) as bytes')
            ->first();

        if ($usage->files >= config('filesystems.uploads.documents_max_per_account')
            || $usage->bytes + $bytes > config('filesystems.uploads.documents_max_mb_per_account') * 1048576) {
            abort(422, __('Document storage is full. Delete some documents to upload more.'));
        }
    }

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
