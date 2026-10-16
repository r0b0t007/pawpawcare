<?php

// Public vet share page (resources/views/share.blade.php). Opened without a
// signed-in user: the language comes from the signed link
// (App\Support\PublicPageLocale). Never put user-entered data here (pet
// names, breeds, record names, notes): it is interpolated as-is.

return [
    'title' => ':name — Medical Summary',
    'language' => 'Language',

    'age' => 'Age',
    'age_value' => ':age yr',
    'born' => 'Born',
    'weight' => 'Weight',
    'microchipped' => 'Microchipped',
    'yes' => 'Yes',
    'no' => 'No',

    'vaccinations' => 'Vaccinations',
    'given' => 'Given :date',
    'completed' => 'Completed',
    'due' => 'Due :date',
    'no_vaccinations' => 'No vaccinations on record.',

    'medications' => 'Active medications',
    'since' => 'since :date',
    'no_medications' => 'No active medications.',

    'notable' => 'Notable change — worth discussing at the visit.',
    'no_weight' => 'No weight history.',

    'clinics' => 'Vet clinics',
    'documents' => 'Recent documents',

    'footer' => 'Shared via PawPawCare · read-only · link expires :expires',

    // Carbon isoFormat patterns. The expiry gets the timezone abbreviation appended.
    'date_format' => 'MMM D, YYYY',
    'expires_format' => 'MMM D, YYYY h:mm A',

    // Fixed values the app stores (the caretaker page uses them too). Anything
    // not listed, e.g. a type the owner typed, is shown as entered.
    'types' => [
        'dog' => 'Dog',
        'cat' => 'Cat',
        'bird' => 'Bird',
        'rabbit' => 'Rabbit',
        'other' => 'Other',
    ],
    'genders' => [
        'male' => 'Male',
        'female' => 'Female',
    ],
    'frequencies' => [
        'daily' => 'daily',
        'weekly' => 'weekly',
        'monthly' => 'monthly',
        'as_needed' => 'as needed',
    ],
    'categories' => [
        'lab' => 'Lab',
        'vaccination' => 'Vaccination',
        'prescription' => 'Prescription',
        'invoice' => 'Invoice',
        'imaging' => 'Imaging',
        'insurance' => 'Insurance',
        'other' => 'Other',
    ],
];
