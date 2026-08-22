<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            // "Gotcha day" — the real adoption date, set by the owner. Care
            // anniversaries use this when present and are SKIPPED otherwise
            // (never faked from created_at).
            $table->date('adopted_on')->nullable()->after('birthday');
        });
    }

    public function down(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            $table->dropColumn('adopted_on');
        });
    }
};
