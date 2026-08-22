<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Permanent per-pet achievement badges, awarded firstOrCreate by the
        // nightly gamification command. Append-only and never revoked — a
        // milestone once earned stays earned even if the underlying records
        // are later deleted (trust rule: nothing gamified is ever taken away).
        Schema::create('milestones', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            // e.g. first_record, records_10, records_25, records_100,
            // weights_5, weights_20, weights_50, vax_complete, anniversary_1…
            $table->string('key', 40);
            $table->timestamp('earned_at');
            $table->timestamp('created_at')->nullable();

            // Awarding is idempotent — reruns of the nightly job are no-ops.
            $table->unique(['pet_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('milestones');
    }
};
