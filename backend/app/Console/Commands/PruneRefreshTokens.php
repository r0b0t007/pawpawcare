<?php

namespace App\Console\Commands;

use App\Models\PasswordResetCode;
use App\Models\RefreshToken;
use Illuminate\Console\Command;

class PruneRefreshTokens extends Command
{
    protected $signature = 'auth:prune-tokens';

    protected $description = 'Delete expired refresh tokens, ones revoked over a week ago, and dead password reset codes.';

    public function handle(): int
    {
        $deleted = RefreshToken::where('expires_at', '<', now())
            ->orWhere(function ($q) {
                $q->where('revoked', true)->where('created_at', '<', now()->subDays(7));
            })
            ->delete();

        // Reset codes carry the network that asked for them: keep them no
        // longer than they can be used.
        $codes = PasswordResetCode::where('expires_at', '<', now())->orWhereNotNull('used_at')->delete();

        $this->info("Pruned {$deleted} refresh token(s) and {$codes} reset code(s).");

        return self::SUCCESS;
    }
}
