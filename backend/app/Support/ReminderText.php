<?php

namespace App\Support;

use App\Models\Medication;
use App\Models\Pet;
use App\Models\User;
use App\Models\Vaccination;
use Illuminate\Support\Carbon;

/**
 * The words of auto-generated reminders (vaccination due, medication dose).
 *
 * ReminderScheduler stores a template key plus the user's own data as JSON
 * params; the text is rendered at read time in the reader's language (push:
 * the recipient's users.locale, API: the request locale). Params hold only
 * what the user typed (vaccine, medication, pet name, dosage) and the due
 * date, never translated, only interpolated.
 *
 * English output is byte-identical to the strings the scheduler used to
 * write, so the stored title/body (still written, in English, as a fallback)
 * and the rendered English text agree.
 */
class ReminderText
{
    public const VACCINATION_DUE = 'vaccination_due';

    public const MEDICATION_DOSE = 'medication_dose';

    public const TEMPLATES = [self::VACCINATION_DUE, self::MEDICATION_DOSE];

    /** @return array{vaccine: string, pet: string, due_date: string} */
    public static function vaccinationParams(Vaccination $vax, Pet $pet): array
    {
        return [
            'vaccine' => (string) $vax->name,
            'pet' => (string) $pet->name,
            'due_date' => $vax->due_date->format('Y-m-d'),
        ];
    }

    /** @return array{medication: string, pet: string, dosage: ?string} */
    public static function medicationParams(Medication $med, Pet $pet): array
    {
        return [
            'medication' => (string) $med->name,
            'pet' => (string) $pet->name,
            'dosage' => $med->dosage,
        ];
    }

    /** Rendered title, or null when the template or its params are unusable. */
    public static function title(?string $template, mixed $params, ?string $locale = null): ?string
    {
        if (! self::usable($template, $params)) {
            return null;
        }
        $locale = self::locale($locale);

        return match ($template) {
            self::VACCINATION_DUE => __('Vaccination due: :vaccine', ['vaccine' => $params['vaccine']], $locale),
            self::MEDICATION_DOSE => __('Medication: :medication', ['medication' => $params['medication']], $locale),
        };
    }

    /**
     * Rendered body. Returns [true, text] when the template rendered (text
     * may legitimately be a bare pet name), [false, null] when it could not.
     *
     * @return array{0: bool, 1: ?string}
     */
    public static function body(?string $template, mixed $params, ?string $locale = null): array
    {
        if (! self::usable($template, $params)) {
            return [false, null];
        }
        $locale = self::locale($locale);

        return [true, match ($template) {
            self::VACCINATION_DUE => __(':pet — :vaccine is due :date', [
                'pet' => $params['pet'],
                'vaccine' => $params['vaccine'],
                'date' => self::dueDate($params['due_date'], $locale),
            ], $locale),
            // Same truthiness the scheduler always used: an empty (or "0")
            // dosage leaves the pet name alone.
            self::MEDICATION_DOSE => ($params['dosage'] ?? null)
                ? __(':pet — :dosage', ['pet' => $params['pet'], 'dosage' => $params['dosage']], $locale)
                : $params['pet'],
        }];
    }

    /**
     * A due date in the reader's language. The ISO format is itself a
     * translation ("MMM D, YYYY" = "Jan 5, 2027", identical to the old
     * PHP 'M j, Y'), so a translator can pick the local convention.
     */
    public static function dueDate(string $ymd, string $locale): string
    {
        return Carbon::createFromFormat('!Y-m-d', $ymd)
            ->locale($locale)
            ->isoFormat(__('MMM D, YYYY', [], $locale));
    }

    /**
     * Recognise a reminder row written before templates existed, by the
     * exact English strings the scheduler produced. Returns [template,
     * params] only when re-rendering those params in English reproduces the
     * stored title and body byte for byte; anything else (a renamed or
     * hand-edited reminder, an ambiguous split) returns null and stays as is.
     *
     * $dosage is the medication's current dosage when the medication still
     * exists; it disambiguates a pet name that itself contains " — ".
     *
     * @return array{0: string, 1: array}|null
     */
    public static function inferLegacy(?string $type, ?string $relatedType, string $title, ?string $body, ?string $dosage = null, bool $medicationKnown = false): ?array
    {
        $candidate = null;

        if ($type === 'vaccination' && $relatedType === 'vaccination'
            && str_starts_with($title, 'Vaccination due: ') && $body !== null) {
            $vaccine = substr($title, strlen('Vaccination due: '));
            $pattern = '/^(.*) — '.preg_quote($vaccine, '/').' is due ([A-Z][a-z]{2} \d{1,2}, \d{4})$/su';
            if (preg_match($pattern, $body, $m)) {
                $date = \DateTimeImmutable::createFromFormat('!M j, Y', $m[2]);
                if ($date !== false) {
                    $candidate = [self::VACCINATION_DUE, [
                        'vaccine' => $vaccine,
                        'pet' => $m[1],
                        'due_date' => $date->format('Y-m-d'),
                    ]];
                }
            }
        } elseif ($type === 'medication' && $relatedType === 'medication'
            && str_starts_with($title, 'Medication: ') && $body !== null) {
            $medication = substr($title, strlen('Medication: '));
            if ($medicationKnown) {
                if ($dosage && str_ends_with($body, ' — '.$dosage)) {
                    $pet = substr($body, 0, -strlen(' — '.$dosage));
                } elseif (! $dosage) {
                    $pet = $body;
                } else {
                    $pet = null; // dosage changed since: can't split safely
                }
            } else {
                // No medication to consult: only an unambiguous body maps.
                $parts = explode(' — ', $body);
                [$pet, $dosage] = match (count($parts)) {
                    1 => [$body, null],
                    2 => [$parts[0], $parts[1]],
                    default => [null, null],
                };
            }
            if ($pet !== null) {
                $candidate = [self::MEDICATION_DOSE, [
                    'medication' => $medication,
                    'pet' => $pet,
                    'dosage' => $dosage ?: null,
                ]];
            }
        }

        if ($candidate === null) {
            return null;
        }

        [$template, $params] = $candidate;
        [, $renderedBody] = self::body($template, $params, 'en');

        return self::title($template, $params, 'en') === $title && $renderedBody === $body
            ? $candidate
            : null;
    }

    private static function usable(?string $template, mixed $params): bool
    {
        if (! in_array($template, self::TEMPLATES, true) || ! is_array($params)) {
            return false;
        }

        $required = $template === self::VACCINATION_DUE
            ? ['vaccine', 'pet', 'due_date']
            : ['medication', 'pet'];
        foreach ($required as $key) {
            if (! isset($params[$key]) || ! is_string($params[$key])) {
                return false;
            }
        }

        return $template !== self::VACCINATION_DUE
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $params['due_date']) === 1;
    }

    private static function locale(?string $locale): string
    {
        $locale ??= app()->getLocale();

        return in_array($locale, User::LOCALES, true) ? $locale : User::LOCALES[0];
    }
}
