<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * The ONLY way to mint (or revoke) an admin. `is_admin` is not fillable and
 * no HTTP endpoint writes it, so admin rights require server-shell access.
 */
class MakeUserAdmin extends Command
{
    protected $signature = 'user:make-admin {email : The account\'s email address}
                            {--revoke : Remove admin rights instead of granting them}';

    protected $description = 'Grant (or --revoke) admin rights to the user with the given email.';

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();

        if (! $user) {
            $this->error("No user found with email {$this->argument('email')}.");

            return self::FAILURE;
        }

        $grant = ! $this->option('revoke');
        // forceFill: is_admin is deliberately outside $fillable.
        $user->forceFill(['is_admin' => $grant])->save();

        $this->info($grant
            ? "{$user->email} is now an admin."
            : "{$user->email} is no longer an admin.");

        return self::SUCCESS;
    }
}
