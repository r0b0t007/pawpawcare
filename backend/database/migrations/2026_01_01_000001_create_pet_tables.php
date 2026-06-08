<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('type', 50)->default('dog');
            $table->string('breed', 100)->nullable();
            $table->float('age')->nullable();
            $table->date('birthday')->nullable();
            $table->float('weight')->nullable();
            $table->string('weight_unit', 5)->default('kg');
            $table->string('gender', 20)->nullable();
            $table->boolean('microchipped')->default(false);
            $table->string('color', 30)->nullable();
            $table->string('avatar_url')->nullable();
            $table->integer('heart_rate')->nullable();
            $table->string('activity_level', 30)->nullable();
            $table->timestamps();
        });

        Schema::create('vaccinations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->string('name', 150);
            $table->date('due_date');
            $table->string('status', 20)->default('upcoming');
            $table->date('administered_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('activities', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('duration', 50)->nullable();
            $table->string('time_of_day', 20)->nullable();
            $table->string('icon', 50)->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('favorite_foods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->string('name', 100);
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('favorite_foods');
        Schema::dropIfExists('activities');
        Schema::dropIfExists('vaccinations');
        Schema::dropIfExists('pets');
    }
};
