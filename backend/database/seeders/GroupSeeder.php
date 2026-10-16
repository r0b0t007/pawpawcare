<?php

namespace Database\Seeders;

use App\Models\Group;
use Illuminate\Database\Seeder;

class GroupSeeder extends Seeder
{
    /**
     * The default groups. name/description are the English text, stored as
     * is; translation_key points at lang/{locale}/groups.php, which Group::
     * toApi uses to show them in the reader's language. Keep the English
     * there identical to the text here.
     */
    public const DEFAULT_GROUPS = [
        [
            'translation_key' => 'dog_lovers',
            'name' => 'Dog Lovers',
            'description' => 'All things dogs — training tips, breed advice, and cute photos.',
            'location' => 'Global',
            'icon' => 'dog',
        ],
        [
            'translation_key' => 'cat_parents',
            'name' => 'Cat Parents',
            'description' => 'Share your feline adventures and get expert advice.',
            'location' => 'Global',
            'icon' => 'cat',
        ],
        [
            'translation_key' => 'pet_health_tips',
            'name' => 'Pet Health Tips',
            'description' => 'Evidence-based nutrition, vet advice, and wellness routines.',
            'location' => 'Global',
            'icon' => 'heart-pulse',
        ],
        [
            'translation_key' => 'puppy_training',
            'name' => 'Puppy Training',
            'description' => 'Positive-reinforcement techniques from beginner to advanced.',
            'location' => 'Global',
            'icon' => 'school',
        ],
        [
            'translation_key' => 'exotic_pets',
            'name' => 'Exotic Pets',
            'description' => 'Rabbits, birds, reptiles — support for the unique companions.',
            'location' => 'Global',
            'icon' => 'rabbit',
        ],
    ];

    public function run(): void
    {
        // Idempotent: only seed when no groups exist yet.
        if (Group::query()->exists()) {
            return;
        }

        foreach (self::DEFAULT_GROUPS as $group) {
            // forceCreate: translation_key is not mass-assignable (no API
            // writes it; only this seeder and its backfill migration do).
            Group::forceCreate($group);
        }
    }
}
