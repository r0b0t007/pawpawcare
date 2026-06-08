<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('dosage', 100)->nullable();
            $table->string('frequency', 20)->default('daily'); // daily, weekly, monthly, as_needed
            $table->json('times')->nullable();                 // ["09:00","20:00"] — dose times per period
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('medication_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('medication_id')->constrained('medications')->cascadeOnDelete();
            $table->dateTime('administered_at');
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medication_logs');
        Schema::dropIfExists('medications');
    }
};
