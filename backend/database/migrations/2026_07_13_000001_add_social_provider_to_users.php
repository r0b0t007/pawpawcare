<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Which identity provider owns this account, and the provider's
            // stable subject id (Google `sub`, Apple `sub`). Null for classic
            // email/password accounts. Unique together so one provider identity
            // maps to exactly one user (NULLs stay distinct, so unlimited
            // password-only rows are fine).
            $table->string('provider')->nullable()->after('hashed_password');
            $table->string('provider_id')->nullable()->after('provider');
            $table->unique(['provider', 'provider_id']);

            // Social-only accounts have no password to hash.
            $table->string('hashed_password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['provider', 'provider_id']);
            $table->dropColumn(['provider', 'provider_id']);
            // Leaving hashed_password nullable on rollback is harmless; not
            // reverting it avoids failing on any social-only rows.
        });
    }
};
