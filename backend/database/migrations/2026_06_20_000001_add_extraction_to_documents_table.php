<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // AI document intake: one extraction per document. `extraction` holds the
        // structured suggestions returned by the model so the review sheet can be
        // re-opened without paying for another API call. Columns are set server-side
        // only — never fillable from request input.
        Schema::table('documents', function (Blueprint $table) {
            $table->string('extraction_status', 10)->default('none'); // none, pending, done, failed
            $table->json('extraction')->nullable();
            $table->timestamp('extracted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn(['extraction_status', 'extraction', 'extracted_at']);
        });
    }
};
