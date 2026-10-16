<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Document;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The records export speaks the account's saved language (users.locale):
 * PDF text, dates and display words; CSV headers. What the user typed stays
 * exactly as entered, and English is covered unchanged by ExportRecordsTest.
 */
class ExportRecordsLocaleTest extends TestCase
{
    use RefreshDatabase;

    /** Today, as the export prints it in $locale ("Exported ..." line). */
    private function today(string $locale, string $pattern): string
    {
        return Carbon::now()->locale($locale)->isoFormat($pattern);
    }

    /** @return array{0: User, 1: string} */
    private function user(string $locale): array
    {
        $user = User::create([
            'name' => 'Zoé Núñez',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $user->forceFill(['locale' => $locale])->save();

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function petWithHistory(User $owner): Pet
    {
        $pet = Pet::create([
            'owner_id' => $owner->id, 'name' => '¿Toño?', 'type' => 'dog', 'breed' => 'Golden Retriever',
            'gender' => 'female', 'birthday' => '2020-09-03', 'weight' => 12.5, 'microchipped' => true,
        ]);

        Vaccination::create(['pet_id' => $pet->id, 'name' => 'Rabies', 'due_date' => '2024-03-01', 'status' => 'completed', 'administered_date' => '2024-02-20', 'notes' => 'Bras gauche']);
        Medication::create(['pet_id' => $pet->id, 'name' => 'Heartgard', 'dosage' => '1 chew', 'frequency' => 'as_needed', 'times' => ['09:00'], 'start_date' => '2025-06-01']);
        $clinic = Clinic::create(['pet_id' => $pet->id, 'name' => 'Happy Paws Clinic', 'vet_name' => 'Dr. Lee']);
        Appointment::create(['pet_id' => $pet->id, 'clinic_id' => $clinic->id, 'title' => 'Annual checkup', 'scheduled_at' => '2025-05-10 10:00:00', 'status' => 'completed']);
        WeightLog::create(['pet_id' => $pet->id, 'weight' => 12.5, 'unit' => 'kg', 'logged_at' => '2025-01-15']);
        Document::create(['pet_id' => $pet->id, 'title' => 'Lab results', 'category' => 'lab', 'file_path' => 'documents/fake.pdf', 'mime' => 'application/pdf', 'size_bytes' => 123]);

        return $pet;
    }

    /**
     * The PDF's text layer: every string Dompdf drew, in order, one per line.
     * Dompdf writes text with an embedded Unicode font as UTF-16BE string
     * operands of TJ inside Flate-compressed content streams — so this reads
     * what a PDF viewer would extract, not the HTML that went in.
     */
    private function pdfText(string $pdf): string
    {
        preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdf, $streams);

        $lines = [];
        foreach ($streams[1] as $raw) {
            $content = @gzuncompress($raw);
            if ($content === false || ! preg_match('/\bBT\b/', $content)) {
                continue;
            }
            preg_match_all('/\[\(((?:\\\\.|[^\\\\)])*)\)\]\s*TJ/s', $content, $strings);
            foreach ($strings[1] as $escaped) {
                $bytes = preg_replace_callback('/\\\\([0-7]{1,3}|.)/s', function ($m) {
                    if (ctype_digit($m[1])) {
                        return chr(octdec($m[1]));
                    }

                    return ['n' => "\n", 'r' => "\r", 't' => "\t", 'b' => "\x08", 'f' => "\f"][$m[1]] ?? $m[1];
                }, $escaped);
                $lines[] = mb_convert_encoding($bytes, 'UTF-8', 'UTF-16BE');
            }
        }

        return implode("\n", $lines);
    }

    public function test_csv_headers_are_in_the_users_language_and_values_stay_as_stored(): void
    {
        [$user, $token] = $this->user('fr');
        $this->petWithHistory($user);

        $csv = $this->withToken($token)->get('/users/me/export?format=csv')->assertOk()->getContent();

        $this->assertStringContainsString('PawPawCare — Export des dossiers de santé', $csv);
        $this->assertStringContainsString('Propriétaire,"Zoé Núñez"', $csv);
        $this->assertStringContainsString('=== ANIMAL : ¿Toño? ===', $csv);
        $this->assertStringContainsString("Nom,Espèce,Race,Sexe,\"Date de naissance\",Âge,Poids,Pucé\n", $csv);
        $this->assertStringContainsString("Nom,Statut,Échéance,\"Administré le\",Notes\n", $csv);
        $this->assertStringContainsString('MÉDICAMENTS', $csv);
        $this->assertStringContainsString('"HISTORIQUE DU POIDS"', $csv);
        $this->assertStringContainsString("Intitulé,Catégorie,\"Ajouté le\"\n", $csv);
        // Display words follow the language...
        $this->assertStringContainsString(',oui', $csv);
        // ...stored ids, ISO dates and typed data stay exactly as stored.
        $this->assertStringContainsString('Rabies,completed,2024-03-01,2024-02-20,"Bras gauche"', $csv);
        $this->assertStringContainsString('¿Toño?,dog,"Golden Retriever",female,2020-09-03', $csv);
        $this->assertStringContainsString('Heartgard,"1 chew",as_needed', $csv);
        $this->assertStringContainsString('"Lab results",lab,'.now()->format('Y-m-d'), $csv);
        $this->assertStringNotContainsString('Microchipped', $csv);
        $this->assertStringNotContainsString('PET:', $csv);
    }

    public function test_csv_headers_in_spanish(): void
    {
        [$user, $token] = $this->user('es');
        $this->petWithHistory($user);

        $csv = $this->withToken($token)->get('/users/me/export?format=csv')->assertOk()->getContent();

        $this->assertStringContainsString('=== MASCOTA: ¿Toño? ===', $csv);
        $this->assertStringContainsString("Nombre,Especie,Raza,Sexo,\"Fecha de nacimiento\",Edad,Peso,Microchip\n", $csv);
        $this->assertStringContainsString("Título,Clínica,\"Programada para\",Estado,Notas\n", $csv);
        $this->assertStringContainsString('CLÍNICAS', $csv);
        $this->assertStringContainsString(',sí,', $csv);
        $this->assertStringContainsString('Rabies,completed,2024-03-01', $csv);
    }

    public function test_the_saved_locale_wins_over_accept_language(): void
    {
        [$user, $token] = $this->user('fr');
        $this->petWithHistory($user);

        $csv = $this->withToken($token)
            ->get('/users/me/export?format=csv', ['Accept-Language' => 'es-ES,es;q=0.9'])
            ->assertOk()
            ->getContent();
        $this->assertStringContainsString('=== ANIMAL : ', $csv);

        // An English account gets the English export whatever the device says.
        [$english, $englishToken] = $this->user('en');
        $this->petWithHistory($english);
        $csv = $this->withToken($englishToken)
            ->get('/users/me/export?format=csv', ['Accept-Language' => 'fr'])
            ->assertOk()
            ->getContent();
        $this->assertStringContainsString('=== PET: ¿Toño? ===', $csv);
        $this->assertStringContainsString("Name,Type,Breed,Gender,Birthday,Age,Weight,Microchipped\n", $csv);
    }

    public function test_pdf_text_and_dates_are_in_french(): void
    {
        [$user, $token] = $this->user('fr');
        $this->petWithHistory($user);

        $pdf = $this->withToken($token)->get('/users/me/export?format=pdf')->assertOk()->getContent();
        $text = $this->pdfText($pdf);

        // The embedded Unicode font (DejaVu Sans), so accents survive.
        $this->assertMatchesRegularExpression('#/BaseFont /[A-Z]+\+DejaVuSans#', $pdf);
        $this->assertStringNotContainsString('/Helvetica', $pdf);

        $this->assertStringContainsString('Dossiers de santé PawPawCare', $text);
        $this->assertStringContainsString('Préparé pour Zoé Núñez · Exporté le '.$this->today('fr', 'D MMMM YYYY'), $text);
        $this->assertStringContainsString('¿Toño?', $text);
        $this->assertStringContainsString('Chien · Golden Retriever · Femelle · Né(e) le 3 sept. 2020', $text);
        $this->assertStringContainsString('Pucé : oui', $text);
        // Stored decimals take the language's decimal mark (pet and weight log).
        $this->assertSame(2, substr_count($text, '12,5 kg'));
        $this->assertStringNotContainsString('12.5', $text);
        // th/h3 are uppercased by CSS, so the text layer holds capitals.
        $this->assertStringContainsString('MÉDICAMENTS', $text);
        $this->assertStringContainsString('ÉCHÉANCE', $text);
        $this->assertStringContainsString('effectuée', $text);   // vaccination status
        $this->assertStringContainsString('effectué', $text);    // appointment status
        $this->assertStringContainsString('au besoin', $text);   // frequency
        $this->assertStringContainsString('analyse', $text);     // document category
        $this->assertStringContainsString('1 mars 2024', $text);
        $this->assertStringContainsString('20 févr. 2024', $text);
        $this->assertStringContainsString('10 mai 2025 10:00', $text);
        $this->assertStringContainsString('15 janv. 2025', $text);
        $this->assertStringContainsString('Vos dossiers vous appartiennent', $text);
        // Typed data is shown as entered.
        $this->assertStringContainsString('Rabies', $text);
        $this->assertStringContainsString('Bras gauche', $text);
        $this->assertStringContainsString('Heartgard', $text);
        $this->assertStringNotContainsString('Microchipped', $text);
        $this->assertStringNotContainsString('Mar 1, 2024', $text);
    }

    public function test_pdf_text_and_dates_are_in_spanish(): void
    {
        [$user, $token] = $this->user('es');
        $this->petWithHistory($user);

        $text = $this->pdfText($this->withToken($token)->get('/users/me/export?format=pdf')->assertOk()->getContent());

        $this->assertStringContainsString('Historial de salud de PawPawCare', $text);
        $this->assertStringContainsString('Exportado el '.$this->today('es', 'D [de] MMMM [de] YYYY'), $text);
        $this->assertStringContainsString('Perro · Golden Retriever · Hembra · Nacido/a el 3 sep. 2020', $text);
        $this->assertStringContainsString('Microchip: sí', $text);
        $this->assertSame(2, substr_count($text, '12,5 kg'));
        $this->assertStringContainsString('AÑADIDO EL', $text);
        $this->assertStringContainsString('administrada', $text);
        $this->assertStringContainsString('según necesidad', $text);
        $this->assertStringContainsString('1 mar. 2024', $text);
        $this->assertStringContainsString('10 may. 2025, 10:00', $text);
        $this->assertStringContainsString('¿Toño?', $text);
    }

    public function test_english_pdf_text_is_unchanged(): void
    {
        [$user, $token] = $this->user('en');
        $this->petWithHistory($user);

        $text = $this->pdfText($this->withToken($token)->get('/users/me/export?format=pdf')->assertOk()->getContent());

        $this->assertStringContainsString('PawPawCare health records', $text);
        $this->assertStringContainsString('Prepared for Zoé Núñez · Exported '.now()->format('F j, Y'), $text);
        $this->assertStringContainsString('Dog · Golden Retriever · Female · Born Sep 3, 2020', $text);
        $this->assertStringContainsString('Microchipped: yes', $text);
        $this->assertSame(2, substr_count($text, '12.5 kg'));
        $this->assertStringContainsString('completed', $text);
        $this->assertStringContainsString('as_needed', $text);
        $this->assertStringContainsString('Mar 1, 2024', $text);
        $this->assertStringContainsString('May 10, 2025 10:00', $text);
        $this->assertStringContainsString('Your records belong to you — export everything free, anytime.', $text);
    }
}
