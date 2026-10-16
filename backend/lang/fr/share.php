<?php

// AI-drafted (formal "vous"), pending review by a native speaker.
// Public vet share page (resources/views/share.blade.php).

return [
    'title' => ':name — Dossier médical',
    'language' => 'Langue',

    'age' => 'Âge',
    'age_value' => ':age an|:age ans',
    'born' => 'Naissance',
    'weight' => 'Poids',
    'microchipped' => 'Pucé',
    'yes' => 'Oui',
    'no' => 'Non',

    'vaccinations' => 'Vaccinations',
    'given' => 'Administrée le :date',
    'completed' => 'Effectuée',
    'due' => 'Prévue le :date',
    'no_vaccinations' => 'Aucune vaccination enregistrée.',

    'medications' => 'Traitements en cours',
    'since' => 'depuis le :date',
    'no_medications' => 'Aucun traitement en cours.',

    'notable' => 'Variation importante — à aborder lors de la consultation.',
    'no_weight' => 'Aucun historique de poids.',

    'clinics' => 'Cliniques vétérinaires',
    'documents' => 'Documents récents',

    'footer' => 'Partagé via PawPawCare · lecture seule · le lien expire le :expires',

    'date_format' => 'D MMM YYYY',
    'expires_format' => 'D MMM YYYY [à] HH:mm',

    'types' => [
        'dog' => 'Chien',
        'cat' => 'Chat',
        'bird' => 'Oiseau',
        'rabbit' => 'Lapin',
        'other' => 'Autre',
    ],
    'genders' => [
        'male' => 'Mâle',
        'female' => 'Femelle',
    ],
    'frequencies' => [
        'daily' => 'quotidien',
        'weekly' => 'hebdomadaire',
        'monthly' => 'mensuel',
        'as_needed' => 'au besoin',
    ],
    'categories' => [
        'lab' => 'Analyses',
        'vaccination' => 'Vaccination',
        'prescription' => 'Ordonnance',
        'invoice' => 'Facture',
        'imaging' => 'Imagerie',
        'insurance' => 'Assurance',
        'other' => 'Autre',
    ],
];
