<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->string('location', 150)->nullable();
            $table->string('icon', 50)->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('posts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('author_id')->constrained('users')->cascadeOnDelete();
            $table->text('content');
            $table->string('image_url')->nullable();
            $table->foreignUuid('group_id')->nullable()->constrained('groups')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('post_paws', function (Blueprint $table) {
            $table->foreignUuid('post_id')->constrained('posts')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->primary(['post_id', 'user_id']);
        });

        Schema::create('group_members', function (Blueprint $table) {
            $table->foreignUuid('group_id')->constrained('groups')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->primary(['group_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('group_members');
        Schema::dropIfExists('post_paws');
        Schema::dropIfExists('posts');
        Schema::dropIfExists('groups');
    }
};
