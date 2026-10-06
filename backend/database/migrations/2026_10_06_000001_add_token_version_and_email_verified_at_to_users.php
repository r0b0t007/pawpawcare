<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Embedded in every access token as `ver`; bumping it revokes all
            // outstanding access tokens at once (JwtAuth rejects a mismatch).
            // Access JWTs are otherwise stateless and live until `exp`.
            $table->unsignedInteger('token_version')->default(0)->after('hashed_password');
            // Set once the user proves they control `email` (emailed code,
            // completed password reset, or a provider-verified social email).
            // Gates anything granted by email address alone, e.g. pet invites.
            $table->timestamp('email_verified_at')->nullable()->after('email');
        });

        // No backfill: before this change social linking matched emails under
        // the accent-insensitive collation, so a linked account doesn't prove
        // its stored address byte-for-byte. Social users get verified on their
        // next sign-in instead (AuthController::loginSocialUser, branch 1),
        // when the provider vouches for the exact stored address.
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['token_version', 'email_verified_at']);
        });
    }
};
