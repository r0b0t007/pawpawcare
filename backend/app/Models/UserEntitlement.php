<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's state for one RevenueCat entitlement. Written only by
 * App\Services\Subscriptions\EntitlementWriter (never from request input),
 * so nothing is fillable.
 */
class UserEntitlement extends Model
{
    protected $guarded = ['*'];

    protected $casts = [
        'expires_at' => 'datetime',
        'billing_issue_at' => 'datetime',
        'unsubscribed_at' => 'datetime',
        'will_renew' => 'boolean',
        'last_event_ms' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Active = not expired (null expiry = lifetime / non-expiring). */
    public function isActive(): bool
    {
        return $this->expires_at === null || $this->expires_at->isFuture();
    }
}
