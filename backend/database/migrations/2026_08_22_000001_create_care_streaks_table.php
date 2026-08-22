<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-pet weekly care streak — a nightly-recomputed CACHE over the six
        // care-signal tables (medication_logs, weight_logs, activities,
        // vaccinations, appointments, documents). Never a write path of its
        // own: it can be dropped and rebuilt at any time, so it can never hold
        // user data hostage. Shared by design — any family member's care
        // counts toward the pet's streak.
        Schema::create('care_streaks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->unique()->constrained('pets')->cascadeOnDelete();
            $table->unsignedInteger('current_weeks')->default(0);
            $table->unsignedInteger('longest_weeks')->default(0);
            // Monday of the most recent ISO week containing >= 1 care action.
            $table->date('last_qualifying_week_start')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('care_streaks');
    }
};
