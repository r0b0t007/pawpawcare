<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->string('category', 20)->default('other'); // vet, food, grooming, medication, supplies, insurance, other
            $table->decimal('amount', 10, 2);
            $table->date('incurred_on');
            $table->string('notes', 200)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['pet_id', 'incurred_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
