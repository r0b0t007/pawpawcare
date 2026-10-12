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
        // so they stop showing in Reminders. Live reminders stay, including a
        // completed record's reminder for its next due date (document intake).
        DB::table('reminders')
            ->where('related_type', 'vaccination')
            ->where('enabled', false)
            ->where(function ($q) {
                $q->whereNotExists(function ($v) {
                    $v->select(DB::raw(1))
                        ->from('vaccinations')
                        ->whereColumn('vaccinations.id', 'reminders.related_id');
                })->orWhereExists(function ($v) {
                    $v->select(DB::raw(1))
                        ->from('vaccinations')
                        ->whereColumn('vaccinations.id', 'reminders.related_id')
                        ->where('vaccinations.status', 'completed');
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
