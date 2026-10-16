<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The English names GroupSeeder has always written, and the key each one
     * maps to. Frozen here on purpose: this migration must keep meaning what
     * it meant when it ran, whatever the seeder says later.
     */
    private const SEEDED_NAMES = [
        'Dog Lovers' => 'dog_lovers',
        'Cat Parents' => 'cat_parents',
        'Pet Health Tips' => 'pet_health_tips',
        'Puppy Training' => 'puppy_training',
        'Exotic Pets' => 'exotic_pets',
    ];

    public function up(): void
    {
        // Tag the default groups already in the database (seeded before
        // translation_key existed) by their exact seeded name. Idempotent:
        // only rows without a key are touched, and a row whose name doesn't
        // match is left alone, so it keeps showing its stored text. The final
        // comparison is done in PHP because MySQL's default collation would
        // also match "dog lovers" or "Dog Lovers " — not the seeded name.
        $rows = DB::table('groups')
            ->whereNull('translation_key')
            ->whereIn('name', array_keys(self::SEEDED_NAMES))
            ->get(['id', 'name']);

        foreach ($rows as $row) {
            $key = self::SEEDED_NAMES[$row->name] ?? null;
            if ($key === null) {
                continue;
            }

            DB::table('groups')
                ->where('id', $row->id)
                ->whereNull('translation_key')
                ->update(['translation_key' => $key]);
        }
    }

    public function down(): void
    {
        // Data only: the stored names and descriptions were never changed,
        // and the add-column migration's down() drops translation_key.
    }
};
