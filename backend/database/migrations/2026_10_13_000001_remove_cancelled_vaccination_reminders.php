<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Completing or deleting a vaccination used to only disable its
        // reminders; it now deletes them (ReminderScheduler::
        // cancelVaccinationReminder). Clear out the disabled rows left behind
        // so they stop showing in Reminders.
        //
        // "Disabled" alone isn't "cancelled": a one-off is also disabled once it
        // fires, and a completed record from document intake can carry a live
        // reminder for its next dose. So, among disabled rows:
        //   - vaccination gone        → remove (nothing left to remind about);
        //   - vaccination completed   → remove only if it never fired, keeping
        //     fired ones and the inbox notices that cascade with them.
        // Enabled reminders and those for open vaccinations are never touched.
        DB::table('reminders')
            ->where('related_type', 'vaccination')
            ->where('enabled', false)
            ->where(function ($q) {
                $q->whereNotExists(function ($v) {
                    $v->select(DB::raw(1))
                        ->from('vaccinations')
                        ->whereColumn('vaccinations.id', 'reminders.related_id');
                })->orWhere(function ($q) {
                    $q->whereNull('reminders.last_fired_at')
                        ->whereExists(function ($v) {
                            $v->select(DB::raw(1))
                                ->from('vaccinations')
                                ->whereColumn('vaccinations.id', 'reminders.related_id')
                                ->where('vaccinations.status', 'completed');
                        });
                });
            })
            ->delete();
    }

    public function down(): void
    {
        // Data cleanup only: the removed rows were already disabled reminders
        // for doses given or records deleted, so there is nothing to restore.
    }
};
