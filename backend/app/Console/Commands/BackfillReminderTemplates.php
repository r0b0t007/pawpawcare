<?php

namespace App\Console\Commands;

use App\Models\Medication;
use App\Models\Reminder;
use App\Support\ReminderText;
use Illuminate\Console\Command;

/**
 * Give auto-generated reminders written before templates existed their
 * template key + params, so they too render in each reader's language.
 *
 * A row is mapped only when its stored title and body match, byte for byte,
 * what the scheduler's English strings produce for the recovered params
 * (ReminderText::inferLegacy); anything else, such as a hand-edited
 * reminder, keeps its stored text. Idempotent: mapped rows are skipped.
 */
class BackfillReminderTemplates extends Command
{
    protected $signature = 'reminders:backfill-templates';

    protected $description = 'Map existing vaccination/medication reminders to translatable templates.';

    public function handle(): int
    {
        $mapped = 0;
        $skipped = 0;

        Reminder::whereNull('template')
            ->whereIn('type', ['vaccination', 'medication'])
            ->chunkById(200, function ($reminders) use (&$mapped, &$skipped) {
                $meds = Medication::whereIn(
                    'id',
                    $reminders->where('related_type', 'medication')->pluck('related_id')->filter()->unique(),
                )->get()->keyBy('id');

                foreach ($reminders as $reminder) {
                    $med = $reminder->related_type === 'medication' ? $meds->get($reminder->related_id) : null;

                    $inferred = ReminderText::inferLegacy(
                        $reminder->type,
                        $reminder->related_type,
                        (string) $reminder->title,
                        $reminder->body,
                        $med?->dosage,
                        $med !== null,
                    );

                    if ($inferred === null) {
                        $skipped++;

                        continue;
                    }

                    [$reminder->template, $reminder->template_params] = $inferred;
                    // Only the template fields change: saveQuietly keeps
                    // updated_at and any model events out of it.
                    $reminder->timestamps = false;
                    $reminder->saveQuietly();
                    $mapped++;
                }
            });

        $this->info("Mapped {$mapped} reminder(s) to templates; left {$skipped} as they are.");

        return self::SUCCESS;
    }
}
