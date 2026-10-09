<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Product-analytics opt-out (PostHog). Lives server-side so it
            // follows the account across devices and so server-side events
            // can honour it too. Crash reporting is separate and unaffected.
            $table->boolean('analytics_opt_out')->default(false)->after('engagement_pushes_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('analytics_opt_out');
        });
    }
};
