<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reminders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('pet_id')->nullable()->constrained('pets')->cascadeOnDelete();
            $table->string('type', 20)->default('custom'); // vaccination, medication, activity, custom
            $table->string('related_type')->nullable();
            $table->string('related_id')->nullable();
            $table->string('title', 150);
            $table->string('body', 255)->nullable();
            $table->string('schedule_type', 12)->default('one_time'); // one_time, recurring
            $table->dateTime('fire_at')->nullable();         // target event time (UTC), for one_time
            $table->string('recurrence', 12)->nullable();    // daily, weekly, monthly
            $table->string('time_of_day', 5)->nullable();    // local HH:MM for recurring
            $table->integer('lead_time_days')->default(0);
            $table->string('timezone')->default('UTC');
            $table->boolean('enabled')->default(true);
            $table->dateTime('last_fired_at')->nullable();
            $table->dateTime('next_fire_at')->nullable();
            $table->timestamps();

            $table->index(['enabled', 'next_fire_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reminders');
    }
};
