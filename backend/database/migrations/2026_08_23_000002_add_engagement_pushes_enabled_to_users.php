<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Server-side opt-out for birthday / gotcha-day / weekly-recap
            // pushes (sends originate server-side, so the switch must live
            // here, not in device-local prefs). Care reminders are separate
            // and unaffected.
            $table->boolean('engagement_pushes_enabled')->default(true)->after('timezone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('engagement_pushes_enabled');
        });
    }
};
