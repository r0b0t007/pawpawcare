<?php

// The community groups the app seeds (GroupSeeder, groups.translation_key).
// English must stay identical to GroupSeeder::DEFAULT_GROUPS — it is what
// the API has always returned for these groups.

return [

    'dog_lovers' => [
        'name' => 'Dog Lovers',
        'description' => 'All things dogs — training tips, breed advice, and cute photos.',
    ],
    'cat_parents' => [
        'name' => 'Cat Parents',
        'description' => 'Share your feline adventures and get expert advice.',
    ],
    'pet_health_tips' => [
        'name' => 'Pet Health Tips',
        'description' => 'Evidence-based nutrition, vet advice, and wellness routines.',
    ],
    'puppy_training' => [
        'name' => 'Puppy Training',
        'description' => 'Positive-reinforcement techniques from beginner to advanced.',
    ],
    'exotic_pets' => [
        'name' => 'Exotic Pets',
        'description' => 'Rabbits, birds, reptiles — support for the unique companions.',
    ],

];
