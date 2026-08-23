<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Idempotency ledger for re-engagement pushes — one row per
 * (user, pet, kind, user-local date). Never serialized to the API.
 */
class EngagementPush extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    // Command-only write target (SendEngagementPushes). Never expose a
    // controller write path that mass-assigns from request input.
    protected $fillable = ['user_id', 'pet_id', 'kind', 'occurrence_date', 'sent_at', 'created_at'];

    protected $casts = [
        'occurrence_date' => 'date:Y-m-d',
        'sent_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
