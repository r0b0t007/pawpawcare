<?php

// Spanish health-records export (formal "usted", es-ES). AI-drafted, pending
// review by a native speaker. Keys mirror lang/en/export.php, plus 'values'.

return [

    'formats' => [
        'date_long' => 'D [de] MMMM [de] YYYY',
        'date' => 'D MMM YYYY',
        'datetime' => 'D MMM YYYY, HH:mm',
    ],

    'yes' => 'sí',
    'no' => 'no',

    'pdf' => [
        'document_title' => 'PawPawCare — Historial de salud',
        'heading' => 'Historial de salud de PawPawCare',
        'prepared_for' => 'Preparado para :name',
        'exported_on' => 'Exportado el :date',
        'promise' => 'Historial completo: nada recortado, nada detrás de un plan de pago.',
        'pet_fallback' => 'mascota',
        'born' => 'Nacido/a el :date',
        'microchipped' => 'Microchip: :answer',

        'vaccinations' => 'Vacunas',
        'no_vaccinations' => 'No hay vacunas registradas.',
        'medications' => 'Medicamentos',
        'no_medications' => 'No hay medicamentos registrados.',
        'appointments' => 'Citas',
        'no_appointments' => 'No hay citas registradas.',
        'clinics' => 'Clínicas',
        'no_clinics' => 'No hay clínicas guardadas.',
        'weights' => 'Historial de peso',
        'no_weights' => 'No hay registros de peso.',
        'documents' => 'Documentos archivados',
        'no_documents' => 'No hay documentos en la caja fuerte.',
        'no_pets' => 'Todavía no hay mascotas que exportar.',

        'col' => [
            'vaccine' => 'Vacuna',
            'status' => 'Estado',
            'due' => 'Vence',
            'administered' => 'Administrada',
            'notes' => 'Notas',
            'medication' => 'Medicamento',
            'dosage' => 'Dosis',
            'frequency' => 'Frecuencia',
            'times' => 'Horas',
            'start' => 'Inicio',
            'end' => 'Fin',
            'active' => 'Activo',
            'visit' => 'Visita',
            'clinic' => 'Clínica',
            'when' => 'Fecha',
            'vet' => 'Veterinario/a',
            'phone' => 'Teléfono',
            'email' => 'Correo electrónico',
            'address' => 'Dirección',
            'date' => 'Fecha',
            'weight' => 'Peso',
            'document' => 'Documento',
            'category' => 'Categoría',
            'added_on' => 'Añadido el',
        ],

        'footer_generated' => 'Generado por PawPawCare',
        'footer_promise' => 'Sus registros le pertenecen: exporte todo, gratis, cuando quiera.',
    ],

    // Display words for the ids the app stores (pet type, statuses...). An id
    // without an entry prints as stored.
    'values' => [
        'pet_type' => [
            'dog' => 'Perro',
            'cat' => 'Gato',
            'bird' => 'Pájaro',
            'rabbit' => 'Conejo',
            'other' => 'Otro',
        ],
        'gender' => [
            'male' => 'Macho',
            'female' => 'Hembra',
        ],
        'vaccination_status' => [
            'upcoming' => 'próxima',
            'overdue' => 'vencida',
            'completed' => 'administrada',
        ],
        'appointment_status' => [
            'scheduled' => 'programada',
            'completed' => 'realizada',
            'cancelled' => 'cancelada',
        ],
        'frequency' => [
            'daily' => 'diaria',
            'weekly' => 'semanal',
            'monthly' => 'mensual',
            'as_needed' => 'según necesidad',
        ],
        'document_category' => [
            'lab' => 'análisis',
            'vaccination' => 'vacuna',
            'prescription' => 'receta',
            'invoice' => 'factura',
            'imaging' => 'imagen',
            'insurance' => 'seguro',
            'other' => 'otro',
        ],
    ],

    'csv' => [
        'title' => 'PawPawCare — Exportación del historial de salud',
        'owner' => 'Propietario/a',
        'exported' => 'Exportado el',
        'pet' => '=== MASCOTA: :name ===',

        'profile' => 'PERFIL',
        'vaccinations' => 'VACUNAS',
        'medications' => 'MEDICAMENTOS',
        'appointments' => 'CITAS',
        'clinics' => 'CLÍNICAS',
        'weights' => 'HISTORIAL DE PESO',
        'documents' => 'DOCUMENTOS (índice: los archivos se quedan en su caja fuerte)',

        'col' => [
            'name' => 'Nombre',
            'type' => 'Especie',
            'breed' => 'Raza',
            'gender' => 'Sexo',
            'birthday' => 'Fecha de nacimiento',
            'age' => 'Edad',
            'weight' => 'Peso',
            'microchipped' => 'Microchip',
            'status' => 'Estado',
            'due_date' => 'Fecha de vencimiento',
            'administered' => 'Administrada',
            'notes' => 'Notas',
            'dosage' => 'Dosis',
            'frequency' => 'Frecuencia',
            'times' => 'Horas',
            'start' => 'Inicio',
            'end' => 'Fin',
            'active' => 'Activo',
            'title' => 'Título',
            'clinic' => 'Clínica',
            'scheduled_at' => 'Programada para',
            'vet' => 'Veterinario/a',
            'phone' => 'Teléfono',
            'email' => 'Correo electrónico',
            'address' => 'Dirección',
            'date' => 'Fecha',
            'unit' => 'Unidad',
            'category' => 'Categoría',
            'added_on' => 'Añadido el',
        ],
    ],

];
