<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Uploaded records (lab results, prescriptions, invoices, scans…). The file
        // lives on the public disk; `file_url` is the relative /storage/... path.
        Schema::create('documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignUuid('clinic_id')->nullable()->constrained('clinics')->nullOnDelete();
            $table->string('title', 150);
            $table->string('category', 20)->default('other'); // lab, vaccination, prescription, invoice, imaging, insurance, other
            $table->string('file_url');
            $table->string('mime', 100)->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->timestamps();

            $table->index(['pet_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
