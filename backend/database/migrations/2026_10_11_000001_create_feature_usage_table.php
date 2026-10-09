<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Free-allowance counters for metered gated features (e.g. AI document
        // reads per pet owner per month). Incremented atomically when a use
        // starts; independent of the records it produced, so deleting them
        // never gives uses back. Only touched while a gate is on.
        Schema::create('feature_usage', function (Blueprint $table) {
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('feature', 32);
            $table->char('period', 7); // Y-m
            $table->unsignedInteger('uses')->default(0);

            $table->primary(['user_id', 'feature', 'period']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feature_usage');
    }
};
