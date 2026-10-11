<?php

namespace App\Models;

use App\Support\Uploads;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LostPetReport extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'pet_id', 'reported_by', 'post_id', 'status',
        'last_seen_location', 'last_seen_at', 'latitude', 'longitude',
        'description', 'contact_phone', 'photo_url', 'resolution_note', 'resolved_at',
    ];

    /** Managed upload urls are stored in their current form (see Uploads::canonicalUrl). */
    protected function photoUrl(): Attribute
    {
        return Attribute::make(set: fn (?string $value) => Uploads::canonicalUrl($value));
    }

    protected $casts = [
        'last_seen_at' => 'datetime',
        'resolved_at' => 'datetime',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    protected static function booted(): void
    {
        // Defensive: an explicit report delete also removes its broadcast post.
        static::deleting(function (LostPetReport $report) {
            if ($report->post_id) {
                Post::where('id', $report->post_id)->delete();
            }
        });
    }

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    /** Serialize to the public lost-pet shape (includes pet + reporter context). */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'status' => $this->status,
            'pet_name' => $this->pet?->name,
            'pet_type' => $this->pet?->type,
            'pet_color' => $this->pet?->color,
            'pet_avatar' => $this->pet?->avatar_url,
            'reporter_name' => $this->reporter?->name,
            'reported_by' => $this->reported_by,
            'last_seen_location' => $this->last_seen_location,
            'last_seen_at' => $this->last_seen_at?->toISOString(),
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'description' => $this->description,
            'contact_phone' => $this->contact_phone,
            'photo_url' => $this->photo_url,
            'resolution_note' => $this->resolution_note,
            'resolved_at' => $this->resolved_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
