<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Ledger row for one RevenueCat webhook event (see the migration). */
class RevenueCatEvent extends Model
{
    protected $table = 'revenuecat_events';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = ['*'];

    protected $casts = [
        'payload' => 'array',
        'event_timestamp_ms' => 'integer',
        'received_at' => 'datetime',
        'processed_at' => 'datetime',
        'attempts' => 'integer',
    ];
}
