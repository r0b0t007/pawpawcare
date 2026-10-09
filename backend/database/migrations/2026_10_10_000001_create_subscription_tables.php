<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Current subscription state per user and entitlement (e.g. "plus"),
        // written only from RevenueCat (webhooks now, API sync in D2). Nothing
        // is gated on it yet — PAYWALL flags arrive in D2, default off.
        Schema::create('user_entitlements', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('entitlement', 64);
            $table->string('product_id', 191)->nullable();
            $table->string('store', 32)->nullable();          // APP_STORE, PLAY_STORE, …
            $table->string('environment', 16)->nullable();    // PRODUCTION | SANDBOX
            $table->string('period_type', 16)->nullable();    // NORMAL | TRIAL | INTRO | PREPAID
            $table->timestamp('expires_at')->nullable();      // null = lifetime / non-expiring
            $table->boolean('will_renew')->default(false);
            $table->timestamp('billing_issue_at')->nullable();
            $table->timestamp('unsubscribed_at')->nullable();
            // Ordering guard: events can arrive out of order; an older event
            // never overwrites state written by a newer one.
            $table->unsignedBigInteger('last_event_ms')->default(0);
            $table->string('last_event_type', 40)->nullable();
            $table->string('source', 16)->default('webhook'); // webhook | sync
            $table->timestamps();

            $table->unique(['user_id', 'entitlement']);
        });

        // Ledger of every RevenueCat webhook event: idempotency (the event id
        // is the key — retries reuse it) and an audit trail for failures the
        // reconcile job retries. Only an allowlist of event fields is stored
        // (see RevenueCatWebhookController::STORED_FIELDS) — never subscriber
        // attributes (email), prices, country or store transaction ids. Rows
        // are deleted with the user at account purge.
        Schema::create('revenuecat_events', function (Blueprint $table) {
            $table->string('id', 100)->primary();
            $table->string('type', 40);
            $table->uuid('user_id')->nullable()->index();
            $table->string('environment', 16)->nullable();
            $table->unsignedBigInteger('event_timestamp_ms');
            $table->json('payload');
            // useCurrent(): an explicit default, so MySQL/MariaDB with
            // explicit_defaults_for_timestamp=OFF can't add ON UPDATE to it.
            $table->timestamp('received_at')->useCurrent();
            $table->timestamp('processed_at')->nullable()->index();
            $table->unsignedInteger('attempts')->default(0);
            $table->string('error', 255)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('revenuecat_events');
        Schema::dropIfExists('user_entitlements');
    }
};
