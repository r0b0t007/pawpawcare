<?php

namespace App\Exceptions;

/**
 * One more medication with reminders, or vaccination, would pass the pet's
 * limit (CHW-245). Rendered as 422 {"detail", "code": "pet_limit_reached"}
 * and never reported — an expected outcome, not an error (bootstrap/app.php).
 * `detail` is in the request's language, so the app can show it as is.
 */
class PetLimitReached extends \RuntimeException {}
