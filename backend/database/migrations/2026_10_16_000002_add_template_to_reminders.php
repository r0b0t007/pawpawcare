<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reminders', function (Blueprint $table) {
            // Auto-generated reminders (vaccination due, medication dose)
            // store a template key (App\Support\ReminderText) plus the user's
            // own data as params, and are rendered at read time in the
            // reader's language. Null for user-created reminders, whose
            // typed title/body are shown as written.
            $table->string('template', 40)->nullable()->after('body');
            $table->json('template_params')->nullable()->after('template');
        });
    }

    public function down(): void
    {
        Schema::table('reminders', function (Blueprint $table) {
            $table->dropColumn(['template', 'template_params']);
        });
    }
};
