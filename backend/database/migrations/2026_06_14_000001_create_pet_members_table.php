<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Co-owners of a pet. The pet's `owner_id` remains the sole admin; rows
        // here grant additional users read/write access to the pet's records.
        Schema::create('pet_members', function (Blueprint $table) {
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role', 12)->default('member'); // member (future: viewer, etc.)
            $table->timestamp('created_at')->nullable();

            $table->primary(['pet_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pet_members');
    }
};
