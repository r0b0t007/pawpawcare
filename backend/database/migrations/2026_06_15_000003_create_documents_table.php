<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Uploaded records (lab results, prescriptions, invoices, scans…). The file
        // lives on the PRIVATE disk; `file_path` is its disk-relative path. It's
        // never served directly — clients mint a short-lived signed URL to view it.
        Schema::create('documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pet_id')->constrained('pets')->cascadeOnDelete();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignUuid('clinic_id')->nullable()->constrained('clinics')->nullOnDelete();
            $table->string('title', 150);
            $table->string('category', 20)->default('other'); // lab, vaccination, prescription, invoice, imaging, insurance, other
            $table->string('file_path');
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
