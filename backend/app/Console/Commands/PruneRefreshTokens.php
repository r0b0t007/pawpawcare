<?php

namespace App\Console\Commands;

use App\Models\RefreshToken;
use Illuminate\Console\Command;

class PruneRefreshTokens extends Command
{
    protected $signature = 'auth:prune-tokens';

    protected $description = 'Delete expired refresh tokens and ones revoked over a week ago.';

    public function handle(): int
    {
        $deleted = RefreshToken::where('expires_at', '<', now())
            ->orWhere(function ($q) {
                $q->where('revoked', true)->where('created_at', '<', now()->subDays(7));
            })
            ->delete();

        $this->info("Pruned {$deleted} refresh token(s).");

        return self::SUCCESS;
    }
}
