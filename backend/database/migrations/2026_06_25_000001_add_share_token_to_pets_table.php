<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-pet secret mixed into every vet share link. Rotating it (via the
        // revoke endpoint) invalidates all outstanding links at once. Set
        // server-side only — never fillable.
        Schema::table('pets', function (Blueprint $table) {
            $table->string('share_token', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            $table->dropColumn('share_token');
        });
    }
};
