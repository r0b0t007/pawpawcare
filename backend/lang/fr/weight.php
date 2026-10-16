<?php

// AI-drafted (formal "vous"), pending review by a native speaker.
// Weight-trend sentence on the vet share page (App\Support\WeightInsight).

return [
    'decimal_point' => ',',
    'thousands_separator' => "\u{202F}",

    'stable' => 'Stable sur :span',
    'up' => "En hausse de :amount :unit (:percent\u{00A0}%) sur :span",
    'down' => "En baisse de :amount :unit (:percent\u{00A0}%) sur :span",

    // {0} is two logs on the same day (shown as one day).
    'days' => '{0} le dernier jour|{1} le dernier jour|[2,*] les :count derniers jours',
    'weeks' => '{1} la dernière semaine|[2,*] les :count dernières semaines',
    'months' => '{1} le dernier mois|[2,*] les :count derniers mois',
];
