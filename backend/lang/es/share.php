<?php

// AI-drafted (formal "usted", es-ES), pending review by a native speaker.
// Public vet share page (resources/views/share.blade.php).

return [
    'title' => ':name — Resumen médico',
    'language' => 'Idioma',

    'age' => 'Edad',
    'age_value' => ':age año|:age años',
    'born' => 'Nacimiento',
    'weight' => 'Peso',
    'microchipped' => 'Microchip',
    'yes' => 'Sí',
    'no' => 'No',

    'vaccinations' => 'Vacunas',
    'given' => 'Administrada el :date',
    'completed' => 'Administrada',
    'due' => 'Vence el :date',
    'no_vaccinations' => 'No hay vacunas registradas.',

    'medications' => 'Medicamentos activos',
    'since' => 'desde el :date',
    'no_medications' => 'No hay medicamentos activos.',

    'notable' => 'Cambio notable: conviene comentarlo en la consulta.',
    'no_weight' => 'No hay historial de peso.',

    'clinics' => 'Clínicas veterinarias',
    'documents' => 'Documentos recientes',

    'footer' => 'Compartido mediante PawPawCare · solo lectura · el enlace caduca el :expires',

    'date_format' => 'D MMM YYYY',
    'expires_format' => 'D MMM YYYY, H:mm',

    'types' => [
        'dog' => 'Perro',
        'cat' => 'Gato',
        'bird' => 'Pájaro',
        'rabbit' => 'Conejo',
        'other' => 'Otro',
    ],
    'genders' => [
        'male' => 'Macho',
        'female' => 'Hembra',
    ],
    'frequencies' => [
        'daily' => 'diaria',
        'weekly' => 'semanal',
        'monthly' => 'mensual',
        'as_needed' => 'según necesidad',
    ],
    'categories' => [
        'lab' => 'Análisis',
        'vaccination' => 'Vacuna',
        'prescription' => 'Receta',
        'invoice' => 'Factura',
        'imaging' => 'Imagen',
        'insurance' => 'Seguro',
        'other' => 'Otro',
    ],
];
