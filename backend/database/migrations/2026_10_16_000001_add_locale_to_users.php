<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // UI/API language (en|fr|es, see User::LOCALES). Picks the language
            // of API error messages (SetLocale middleware) and, later, of
            // emails and push notifications. Existing accounts start on 'en'.
            $table->string('locale', 5)->default('en')->after('timezone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('locale');
        });
    }
};
