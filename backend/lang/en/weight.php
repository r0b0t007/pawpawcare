<?php

// Weight-trend sentence on the vet share page (App\Support\WeightInsight).
// :amount and :percent are already formatted with the marks below.

return [
    'decimal_point' => '.',
    'thousands_separator' => ',',

    'stable' => 'Stable over the last :span',
    'up' => 'Up :amount :unit (:percent%) over the last :span',
    'down' => 'Down :amount :unit (:percent%) over the last :span',

    // {0} is two logs on the same day (shown as one day).
    'days' => '[0,1] :count day|[2,*] :count days',
    'weeks' => '{1} :count week|[2,*] :count weeks',
    'months' => '{1} :count month|[2,*] :count months',
];
