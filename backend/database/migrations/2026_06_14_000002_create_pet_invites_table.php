<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Pending co-owner invitations, addressed by email so a pet can be shared
        // with someone before (or whether or not) they have an account yet.
        Schema::create('pet_invites', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->foreignUuid('invited_by')->constrained('users')->cascadeOnDelete();
            $table->string('email');
            $table->string('status', 12)->default('pending'); // pending, accepted, declined
            $table->timestamps();

            $table->index(['email', 'status']);
            $table->index(['pet_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pet_invites');
    }
};
