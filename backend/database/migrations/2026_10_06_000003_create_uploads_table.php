<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Who uploaded each public image. A `/storage/...` URL is only accepted
        // on a user/pet/post/lost-pet record when the requester (or, for a pet,
        // one of its members) uploaded it, and cleanup only ever deletes files
        // listed here — so nobody can reference, and thereby delete, someone
        // else's file. Files uploaded before this table existed have no row and
        // are left to `uploads:prune`.
        //
        // user_id is nulled (not cascaded) when the uploader's account is
        // purged: the file may still be a shared pet's photo, and keeping the
        // row keeps it tracked for cleanup — while a null owner means nobody
        // can newly attach it.
        Schema::create('uploads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('path')->unique();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploads');
    }
};
