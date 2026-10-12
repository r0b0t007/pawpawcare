<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Triage context for in-app feedback and support messages. All
        // nullable: older apps send only the message.
        Schema::table('support_messages', function (Blueprint $table) {
            $table->string('category', 16)->nullable()->after('message');
            $table->string('app_version', 32)->nullable()->after('category');
            $table->string('platform', 8)->nullable()->after('app_version');
        });
    }

    public function down(): void
    {
        Schema::table('support_messages', function (Blueprint $table) {
            $table->dropColumn(['category', 'app_version', 'platform']);
        });
    }
};
