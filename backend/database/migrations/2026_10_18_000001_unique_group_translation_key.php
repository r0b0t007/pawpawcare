<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per built-in group (CHW-214): GroupSeeder checks for a key and
     * then inserts, so two overlapping runs could otherwise both insert.
     * Groups without a key (null) are unaffected — nulls never collide.
     */
    public function up(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->unique('translation_key');
        });
    }

    public function down(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropUnique(['translation_key']);
        });
    }
};
