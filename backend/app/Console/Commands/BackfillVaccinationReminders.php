<?php

namespace App\Console\Commands;

use App\Models\Vaccination;
use App\Services\ReminderScheduler;
use Illuminate\Console\Command;

class BackfillVaccinationReminders extends Command
{
    protected $signature = 'reminders:backfill-vaccinations';

    protected $description = 'Create reminders for existing, not-yet-administered vaccinations.';

    public function handle(): int
    {
        $count = 0;

        Vaccination::where('status', '!=', 'completed')
            ->whereNotNull('due_date')
            ->chunkById(200, function ($vaccinations) use (&$count) {
                foreach ($vaccinations as $vax) {
                    if (ReminderScheduler::syncVaccinationReminder($vax)) {
                        $count++;
                    }
                }
            });

        $this->info("Backfilled {$count} vaccination reminder(s).");

        return self::SUCCESS;
    }
}
