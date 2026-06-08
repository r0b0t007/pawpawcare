<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('weight_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->float('weight');
            $table->string('unit', 5)->default('kg');
            $table->date('logged_at');
            $table->string('notes', 200)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['pet_id', 'logged_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('weight_logs');
    }
};
