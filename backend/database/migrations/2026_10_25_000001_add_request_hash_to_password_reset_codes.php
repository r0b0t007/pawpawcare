<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A code the app asked for is bound to the request that asked: the
        // SHA-256 of a random request ID handed only to that caller. Only a
        // reset sending that ID can check it, so a stranger can neither
        // cancel nor burn it. NULL = asked for by an older app (unbound).
        Schema::table('password_reset_codes', function (Blueprint $table) {
            $table->string('request_hash', 64)->nullable()->unique()->after('code_hash');
        });
    }

    public function down(): void
    {
        Schema::table('password_reset_codes', function (Blueprint $table) {
            $table->dropUnique(['request_hash']);
            $table->dropColumn('request_hash');
        });
    }
};
