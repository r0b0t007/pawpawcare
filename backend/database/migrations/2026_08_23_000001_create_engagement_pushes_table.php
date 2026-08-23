<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Idempotency ledger for re-engagement pushes (birthday, gotcha day,
        // weekly recap) — mirrors reminder_deliveries' firstOrCreate pattern
        // so hourly command reruns can never double-send. Every push here is
        // anchored to a real event about the user's real pet; the recap is
        // suppressed entirely when there is nothing to say.
        Schema::create('engagement_pushes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('pet_id')->nullable()->constrained('pets')->cascadeOnDelete();
            $table->string('kind', 20); // birthday | gotcha_day | weekly_recap
            $table->date('occurrence_date'); // the user-local calendar date
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->unique(['user_id', 'pet_id', 'kind', 'occurrence_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('engagement_pushes');
    }
};
