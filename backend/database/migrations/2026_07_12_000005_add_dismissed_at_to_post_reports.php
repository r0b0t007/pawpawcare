<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('post_reports', function (Blueprint $table) {
            // Soft-dismiss: an admin clearing a post's reports stamps this
            // instead of deleting the rows, so moderation decisions leave an
            // audit trail. A NULL dismissed_at is an open (active) report;
            // everything that counts reports filters on it.
            $table->timestamp('dismissed_at')->nullable()->after('created_at');
            $table->index(['post_id', 'dismissed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('post_reports', function (Blueprint $table) {
            $table->dropIndex(['post_id', 'dismissed_at']);
            $table->dropColumn('dismissed_at');
        });
    }
};
