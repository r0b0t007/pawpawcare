<?php

namespace Database\Seeders;

use App\Models\Group;
use Illuminate\Database\Seeder;

class GroupSeeder extends Seeder
{
    public const DEFAULT_GROUPS = [
        [
            'name' => 'Dog Lovers',
            'description' => 'All things dogs — training tips, breed advice, and cute photos.',
            'location' => 'Global',
            'icon' => 'dog',
        ],
        [
            'name' => 'Cat Parents',
            'description' => 'Share your feline adventures and get expert advice.',
            'location' => 'Global',
            'icon' => 'cat',
        ],
        [
            'name' => 'Pet Health Tips',
            'description' => 'Evidence-based nutrition, vet advice, and wellness routines.',
            'location' => 'Global',
            'icon' => 'heart-pulse',
        ],
        [
            'name' => 'Puppy Training',
            'description' => 'Positive-reinforcement techniques from beginner to advanced.',
            'location' => 'Global',
            'icon' => 'school',
        ],
        [
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
            Group::create($group);
        }
    }
}
