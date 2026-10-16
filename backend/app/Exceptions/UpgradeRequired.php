<?php

namespace App\Exceptions;

/**
 * A gated feature was used without a plan. Rendered as
 * 402 {"detail", "code": "upgrade_required", "feature"} and never reported —
 * it's an expected outcome, not an error (bootstrap/app.php). `detail` is in
 * the request's language; `code` and `feature` are fixed machine values.
 */
class UpgradeRequired extends \RuntimeException
{
    public function __construct(public readonly string $feature)
    {
        parent::__construct(__('This feature needs PawPawCare Plus.'));
    }
}
