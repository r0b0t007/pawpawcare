<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each code remembers the network that asked for it (ClientNetwork):
        // a new request replaces only that network's earlier code, and checks
        // from anywhere else spend a budget of their own (other_attempts), so
        // a stranger can neither cancel nor burn the code in the owner's inbox.
        Schema::table('password_reset_codes', function (Blueprint $table) {
            $table->string('network', 45)->nullable()->after('code_hash');
            $table->unsignedTinyInteger('other_attempts')->default(0)->after('attempts');
        });
    }

    public function down(): void
    {
        Schema::table('password_reset_codes', function (Blueprint $table) {
            $table->dropColumn(['network', 'other_attempts']);
        });
    }
};
