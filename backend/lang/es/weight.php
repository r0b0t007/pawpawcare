<?php

// AI-drafted (formal "usted", es-ES), pending review by a native speaker.
// Weight-trend sentence on the vet share page (App\Support\WeightInsight).

return [
    'decimal_point' => ',',
    'thousands_separator' => '.',

    'stable' => 'Estable en :span',
    'up' => "Sube :amount :unit (:percent\u{00A0}%) en :span",
    'down' => "Baja :amount :unit (:percent\u{00A0}%) en :span",

    // {0} is two logs on the same day (shown as one day).
    'days' => '{0} el último día|{1} el último día|[2,*] los últimos :count días',
    'weeks' => '{1} la última semana|[2,*] las últimas :count semanas',
    'months' => '{1} el último mes|[2,*] los últimos :count meses',
];
