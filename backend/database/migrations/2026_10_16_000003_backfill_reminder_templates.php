<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;

return new class extends Migration
{
    public function up(): void
    {
        // Map auto-generated reminders written before templates existed to
        // their template by the exact English strings the scheduler wrote
        // (reminders:backfill-templates). Rows it can't map keep their
        // stored text, so nothing changes for them.
        Artisan::call('reminders:backfill-templates');
    }

    public function down(): void
    {
        // Data only: the stored English title/body were never changed, and
        // the add-columns migration's down() drops the template fields.
    }
};
