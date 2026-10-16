<?php

// Public caretaker page (resources/views/care.blade.php). Opened without a
// signed-in user: the language comes from the signed link
// (App\Support\PublicPageLocale). Owner-written notes (feeding, instructions,
// contacts) are shown as entered. Pet types and medication frequencies reuse
// the share.* labels.

return [
    'title' => 'Caring for :name',
    'eyebrow' => 'Caretaker notes',
    'feeding' => 'Feeding',
    'instructions' => 'Instructions',
    'medications' => 'Medications',
    'no_medications' => 'No active medications.',
    'emergency' => 'Emergency',
    'sos' => "If something's wrong",
    'call' => 'Call :phone',
    'vet_clinic' => 'Vet clinic',
    'footer' => 'Shared via PawPawCare · read-only · link expires :expires',

    // Carbon isoFormat pattern; the timezone abbreviation is appended.
    'expires_format' => 'MMM D, YYYY h:mm A',
];
