<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reminder_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('reminder_id')->constrained('reminders')->cascadeOnDelete();
            $table->dateTime('occurrence_at');
            $table->string('channel', 10)->default('push'); // push, local
            $table->string('status', 12)->default('pending'); // pending, sent, failed, acknowledged, snoozed, dismissed
            $table->dateTime('snoozed_until')->nullable();
            $table->dateTime('sent_at')->nullable();
            $table->dateTime('read_at')->nullable();
            $table->timestamps();

            // Idempotency / dedup key — the job can't double-insert or double-send an occurrence.
            $table->unique(['reminder_id', 'occurrence_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reminder_deliveries');
    }
};
