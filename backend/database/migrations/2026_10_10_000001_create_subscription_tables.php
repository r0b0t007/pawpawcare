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
        // DATETIME, not TIMESTAMP: MySQL's TIMESTAMP stops at 2038.
        Schema::create('user_entitlements', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('entitlement', 64);
            $table->string('product_id', 191)->nullable();
            $table->string('store', 32)->nullable();          // APP_STORE, PLAY_STORE, …
            $table->string('environment', 16)->nullable();    // PRODUCTION | SANDBOX
            $table->string('period_type', 16)->nullable();    // NORMAL | TRIAL | INTRO | PREPAID
            // Active = is_lifetime OR expires_at / grace_expires_at in the
            // future. A missing expiry is NOT lifetime: only a one-time
            // purchase with no expiry sets is_lifetime.
            $table->boolean('is_lifetime')->default(false);
            $table->dateTime('expires_at')->nullable();
            $table->dateTime('grace_expires_at')->nullable(); // billing grace period
            $table->boolean('will_renew')->default(false);
            $table->dateTime('billing_issue_at')->nullable();
            $table->dateTime('unsubscribed_at')->nullable();
            // Ordering guard: events can arrive out of order; an older event
            // never overwrites state written by a newer one.
            $table->unsignedBigInteger('last_event_ms')->default(0);
            $table->string('last_event_type', 40)->nullable();
            $table->string('source', 16)->default('webhook'); // webhook | sync
            $table->timestamps();

            $table->unique(['user_id', 'entitlement']);
        });

        // Ledger of every RevenueCat webhook event: idempotency (the event id
        // is the key — retries reuse it) and an audit trail. The payload holds
        // an allowlist of fields and NO customer identifiers; who an event is
        // about lives only in revenuecat_event_users, keyed to our users with
        // foreign keys, so deleting an account removes the link and leaves the
        // event anonymous.
        Schema::create('revenuecat_events', function (Blueprint $table) {
            $table->string('id', 100)->primary();
            $table->string('type', 40);
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('environment', 16)->nullable();
            $table->unsignedBigInteger('event_timestamp_ms');
            $table->json('payload');
            $table->dateTime('received_at')->useCurrent();
            $table->dateTime('processed_at')->nullable()->index();
            $table->unsignedInteger('attempts')->default(0);
            // Outcome: pending | applied | stale | ignored | unknown_user |
            // needs_sync | failed. needs_sync and failed rows wait for D2's
            // API sync / reconcile job (failed ones are also redelivered by
            // RevenueCat, which retries non-2xx responses).
            $table->string('status', 20)->default('pending')->index();
            $table->string('error', 255)->nullable(); // exception text, for failed only
        });

        // Which of OUR users an event names, and how. Rows are only created for
        // ids that are existing users; both foreign keys cascade.
        Schema::create('revenuecat_event_users', function (Blueprint $table) {
            $table->string('event_id', 100);
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            // app_user | original | alias | transfer_to | transfer_from
            $table->string('role', 16);

            $table->primary(['event_id', 'user_id', 'role']);
            $table->foreign('event_id')->references('id')->on('revenuecat_events')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('revenuecat_event_users');
        Schema::dropIfExists('revenuecat_events');
        Schema::dropIfExists('user_entitlements');
    }
};
