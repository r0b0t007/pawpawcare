<?php

// French health-records export (formal "vous"). AI-drafted, pending review
// by a native speaker. Keys mirror lang/en/export.php, plus 'values'.

return [

    'formats' => [
        'date_long' => 'D MMMM YYYY',
        'date' => 'D MMM YYYY',
        'datetime' => 'D MMM YYYY HH:mm',
    ],

    'yes' => 'oui',
    'no' => 'non',

    'pdf' => [
        'document_title' => 'PawPawCare — Dossiers de santé',
        'heading' => 'Dossiers de santé PawPawCare',
        'prepared_for' => 'Préparé pour :name',
        'exported_on' => 'Exporté le :date',
        'promise' => 'Historique complet — rien de coupé, rien derrière un abonnement.',
        'pet_fallback' => 'animal',
        'born' => 'Né(e) le :date',
        'microchipped' => 'Pucé : :answer',

        'vaccinations' => 'Vaccinations',
        'no_vaccinations' => 'Aucune vaccination enregistrée.',
        'medications' => 'Médicaments',
        'no_medications' => 'Aucun médicament enregistré.',
        'appointments' => 'Rendez-vous',
        'no_appointments' => 'Aucun rendez-vous enregistré.',
        'clinics' => 'Cliniques',
        'no_clinics' => 'Aucune clinique enregistrée.',
        'weights' => 'Historique du poids',
        'no_weights' => 'Aucune pesée enregistrée.',
        'documents' => 'Documents enregistrés',
        'no_documents' => 'Aucun document dans le coffre.',
        'no_pets' => 'Aucun animal à exporter pour l\'instant.',

        'col' => [
            'vaccine' => 'Vaccin',
            'status' => 'Statut',
            'due' => 'Échéance',
            'administered' => 'Administré le',
            'notes' => 'Notes',
            'medication' => 'Médicament',
            'dosage' => 'Dosage',
            'frequency' => 'Fréquence',
            'times' => 'Heures',
            'start' => 'Début',
            'end' => 'Fin',
            'active' => 'Actif',
            'visit' => 'Visite',
            'clinic' => 'Clinique',
            'when' => 'Date',
            'vet' => 'Vétérinaire',
            'phone' => 'Téléphone',
            'email' => 'E-mail',
            'address' => 'Adresse',
            'date' => 'Date',
            'weight' => 'Poids',
            'document' => 'Document',
            'category' => 'Catégorie',
            'added_on' => 'Ajouté le',
        ],

        'footer_generated' => 'Généré par PawPawCare',
        'footer_promise' => 'Vos dossiers vous appartiennent — exportez tout, gratuitement, à tout moment.',
    ],

    // Display words for the ids the app stores (pet type, statuses...). An id
    // without an entry prints as stored.
    'values' => [
        'pet_type' => [
            'dog' => 'Chien',
            'cat' => 'Chat',
            'bird' => 'Oiseau',
            'rabbit' => 'Lapin',
            'other' => 'Autre',
        ],
        'gender' => [
            'male' => 'Mâle',
            'female' => 'Femelle',
        ],
        'vaccination_status' => [
            'upcoming' => 'à venir',
            'overdue' => 'en retard',
            'completed' => 'effectuée',
        ],
        'appointment_status' => [
            'scheduled' => 'prévu',
            'completed' => 'effectué',
            'cancelled' => 'annulé',
        ],
        'frequency' => [
            'daily' => 'quotidienne',
            'weekly' => 'hebdomadaire',
            'monthly' => 'mensuelle',
            'as_needed' => 'au besoin',
        ],
        'document_category' => [
            'lab' => 'analyse',
            'vaccination' => 'vaccin',
            'prescription' => 'ordonnance',
            'invoice' => 'facture',
            'imaging' => 'imagerie',
            'insurance' => 'assurance',
            'other' => 'autre',
        ],
    ],

    'csv' => [
        'title' => 'PawPawCare — Export des dossiers de santé',
        'owner' => 'Propriétaire',
        'exported' => 'Exporté le',
        'pet' => '=== ANIMAL : :name ===',

        'profile' => 'PROFIL',
        'vaccinations' => 'VACCINATIONS',
        'medications' => 'MÉDICAMENTS',
        'appointments' => 'RENDEZ-VOUS',
        'clinics' => 'CLINIQUES',
        'weights' => 'HISTORIQUE DU POIDS',
        'documents' => 'DOCUMENTS (index — les fichiers restent dans votre coffre)',

        'col' => [
            'name' => 'Nom',
            'type' => 'Espèce',
            'breed' => 'Race',
            'gender' => 'Sexe',
            'birthday' => 'Date de naissance',
            'age' => 'Âge',
            'weight' => 'Poids',
            'microchipped' => 'Pucé',
            'status' => 'Statut',
            'due_date' => 'Échéance',
            'administered' => 'Administré le',
            'notes' => 'Notes',
            'dosage' => 'Dosage',
            'frequency' => 'Fréquence',
            'times' => 'Heures',
            'start' => 'Début',
            'end' => 'Fin',
            'active' => 'Actif',
            'title' => 'Intitulé',
            'clinic' => 'Clinique',
            'scheduled_at' => 'Prévu le',
            'vet' => 'Vétérinaire',
            'phone' => 'Téléphone',
            'email' => 'E-mail',
            'address' => 'Adresse',
            'date' => 'Date',
            'unit' => 'Unité',
            'category' => 'Catégorie',
            'added_on' => 'Ajouté le',
        ],
    ],

];
