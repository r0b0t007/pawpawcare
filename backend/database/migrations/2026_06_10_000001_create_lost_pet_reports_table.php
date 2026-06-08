<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lost_pet_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->foreignUuid('reported_by')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('post_id')->nullable()->constrained('posts')->nullOnDelete();
            $table->string('status', 12)->default('active'); // active, resolved
            $table->string('last_seen_location', 200)->nullable();
            $table->dateTime('last_seen_at')->nullable();
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->text('description')->nullable();
            $table->string('contact_phone', 40)->nullable();
            $table->string('photo_url')->nullable();
            $table->string('resolution_note', 200)->nullable();
            $table->dateTime('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lost_pet_reports');
    }
};
