<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A pet's vet clinics / care providers (contact card).
        Schema::create('clinics', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('vet_name', 150)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('address', 255)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('pet_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinics');
    }
};
