<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Caretaker mode: owner-authored handoff notes for a pet sitter, shown
        // on the time-limited caretaker page. One profile per pet.
        Schema::create('care_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->unique()->constrained('pets')->cascadeOnDelete();
            $table->text('feeding')->nullable();
            $table->text('instructions')->nullable();
            $table->string('emergency_name', 150)->nullable();
            $table->string('emergency_phone', 50)->nullable();
            $table->timestamps();
        });

        // Per-pet secret mixed into caretaker links — rotated to revoke them.
        // Independent from share_token so vet and caretaker links revoke
        // separately. Set server-side only; never fillable.
        Schema::table('pets', function (Blueprint $table) {
            $table->string('care_token', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('care_profiles');
        Schema::table('pets', function (Blueprint $table) {
            $table->dropColumn('care_token');
        });
    }
};
