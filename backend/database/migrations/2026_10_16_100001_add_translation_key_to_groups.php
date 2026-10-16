<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            // Which lang/{locale}/groups.php entry names and describes this
            // group ('dog_lovers'...). Set only on the groups the app seeds
            // (GroupSeeder); null means name/description are shown as stored.
            $table->string('translation_key', 50)->nullable()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropColumn('translation_key');
        });
    }
};
