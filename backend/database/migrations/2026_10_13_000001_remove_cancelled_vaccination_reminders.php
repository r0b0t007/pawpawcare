<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Completing or deleting a vaccination used to switch off every one of
        // its reminders; it now deletes the ones that never fired
        // (ReminderScheduler::cancelVaccinationReminder). Apply the same rule
        // to the rows left behind: switched off, never fired, and their
        // vaccination completed or gone. A reminder that fired is never
        // removed (its inbox notice cascades with it), and nothing tied to an
        // open vaccination is touched.
        DB::table('reminders')
            ->where('related_type', 'vaccination')
            ->where('enabled', false)
            ->whereNull('last_fired_at')
            ->whereNotIn('related_id', DB::table('vaccinations')->select('id')->where('status', '!=', 'completed'))
            ->delete();
    }

    public function down(): void
    {
        // Data cleanup only: the removed rows were switched-off reminders that
        // never fired, for doses given or records deleted.
    }
};
