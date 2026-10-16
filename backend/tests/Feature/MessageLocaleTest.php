<?php

namespace Tests\Feature;

use App\Mail\EmailVerificationCodeMail;
use App\Mail\PasswordResetCodeMail;
use App\Models\DeviceToken;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\Reminder;
use App\Models\ReminderDelivery;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\JwtService;
use App\Services\ReminderScheduler;
use App\Support\ReminderText;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * CHW-192: emails, reminder pushes and engagement pushes are written in the
 * recipient's language (users.locale); the reminders API renders in the
 * request user's. User-typed text (pet names, vaccine names, a reminder the
 * user wrote) is interpolated or shown as typed, never translated.
 */
class MessageLocaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(['exp.host/*' => Http::response(['data' => []])]);
    }

    /** @return array{0: User, 1: string} */
    private function actingUser(string $locale = 'en', array $attrs = []): array
    {
        $user = User::create(array_merge([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ], $attrs));
        $user->forceFill(['locale' => $locale])->save();

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function withDevice(User $user): void
    {
        DeviceToken::create([
            'user_id' => $user->id,
            'token' => 'ExponentPushToken['.uniqid().']',
            'platform' => 'ios',
            'timezone' => 'UTC',
        ]);
    }

    /** Every push message sent through the faked Expo endpoint. */
    private function pushes(): array
    {
        return Http::recorded()
            ->filter(fn ($pair) => str_contains($pair[0]->url(), 'exp.host'))
            ->flatMap(fn ($pair) => $pair[0]->data())
            ->values()
            ->all();
    }

    private function vaccinationFor(User $user, string $petName = 'Luna', string $vaccine = 'Rabies', string $due = '2027-01-05'): Vaccination
    {
        $pet = Pet::create(['owner_id' => $user->id, 'name' => $petName]);

        return Vaccination::create(['pet_id' => $pet->id, 'name' => $vaccine, 'due_date' => $due]);
    }

    // ── Emails ──────────────────────────────────────────────────────────────

    public static function verificationEmails(): array
    {
        return [
            'en' => ['en', 'Your PawPawCare verification code', 'Use this code to confirm your email address in PawPawCare:', "If you didn't request this, you can safely ignore this email."],
            'fr' => ['fr', 'Votre code de vérification PawPawCare', 'Utilisez ce code pour confirmer votre adresse e-mail dans PawPawCare', "Ce code expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande"],
            'es' => ['es', 'Su código de verificación de PawPawCare', 'Utilice este código para confirmar su dirección de correo electrónico en PawPawCare:', 'El código caduca en 30 minutos.'],
        ];
    }

    #[DataProvider('verificationEmails')]
    public function test_verification_email_is_sent_in_the_users_language(string $locale, string $subject, string $intro, string $expiry): void
    {
        Mail::fake();
        [, $token] = $this->actingUser($locale);

        // A header in another language: the account's language wins.
        $this->withToken($token)->withHeader('Accept-Language', $locale === 'en' ? 'fr' : 'en')
            ->postJson('/users/me/email-verification')->assertOk();

        Mail::assertSent(EmailVerificationCodeMail::class, 1);
        Mail::assertSent(EmailVerificationCodeMail::class, function (EmailVerificationCodeMail $mail) use ($locale, $subject, $intro, $expiry) {
            $this->assertSame($locale, $mail->locale);
            $mail->assertHasSubject($subject);
            $mail->assertSeeInHtml($intro, false);
            $mail->assertSeeInHtml($expiry, false);
            $mail->assertSeeInHtml($mail->code);

            return true;
        });
    }

    public static function resetEmails(): array
    {
        return [
            'fr' => ['fr', 'Votre code de réinitialisation du mot de passe PawPawCare', 'votre mot de passe ne sera pas modifié', "L'équipe PawPawCare"],
            'es' => ['es', 'Su código para restablecer la contraseña de PawPawCare', 'su contraseña no cambiará', 'El equipo de PawPawCare'],
        ];
    }

    #[DataProvider('resetEmails')]
    public function test_password_reset_email_is_sent_in_the_users_language(string $locale, string $subject, string $body, string $signoff): void
    {
        Mail::fake();
        [$user] = $this->actingUser($locale);

        // Unauthenticated, with an English header: the account's language wins.
        $this->withHeader('Accept-Language', 'en')
            ->postJson('/auth/forgot-password', ['email' => $user->email])->assertOk();

        Mail::assertSent(PasswordResetCodeMail::class, 1);
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) use ($locale, $subject, $body, $signoff) {
            $this->assertSame($locale, $mail->locale);
            $mail->assertHasSubject($subject);
            $mail->assertSeeInHtml($body, false);
            $mail->assertSeeInHtml($signoff, false);

            return true;
        });
    }

    public function test_english_emails_are_unchanged(): void
    {
        $verify = (new EmailVerificationCodeMail('123456'))->locale('en');
        $verify->assertHasSubject('Your PawPawCare verification code');
        $this->assertStringContainsString(
            "<p>Hi,</p>\n<p>Use this code to confirm your email address in PawPawCare:</p>\n"
            ."<p style=\"font-size:28px;font-weight:bold;letter-spacing:6px;\">123456</p>\n"
            ."<p>The code expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>\n"
            .'<p>— The PawPawCare team</p>',
            $verify->render(),
        );

        $reset = (new PasswordResetCodeMail('654321'))->locale('en');
        $reset->assertHasSubject('Your PawPawCare password reset code');
        $this->assertStringContainsString(
            "<p>The code expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>",
            $reset->render(),
        );
    }

    public function test_email_translations_are_escaped_as_text(): void
    {
        // A future translation with markup in it must not become live HTML.
        app('translator')->addLines([
            '*.Hi,' => '<a href="https://evil.example">Bonjour</a> & bienvenue,',
            '*.— The PawPawCare team' => "L'équipe <b>PawPawCare</b>",
        ], 'fr');

        foreach ([new EmailVerificationCodeMail('123456'), new PasswordResetCodeMail('654321')] as $mail) {
            $html = $mail->locale('fr')->render();

            $this->assertStringNotContainsString('<a href', $html);
            $this->assertStringNotContainsString('<b>', $html);
            $this->assertStringContainsString('<p>&lt;a href="https://evil.example"&gt;Bonjour&lt;/a&gt; &amp; bienvenue,</p>', $html);
            $this->assertStringContainsString("<p>L'équipe &lt;b&gt;PawPawCare&lt;/b&gt;</p>", $html);
        }
    }

    // ── Reminders: stored as templates, rendered per reader ─────────────────

    public function test_generated_reminders_store_a_template_and_keep_english_text(): void
    {
        [$user] = $this->actingUser('fr');
        $vax = $this->vaccinationFor($user);
        ReminderScheduler::syncVaccinationReminder($vax);

        $reminder = Reminder::where('related_id', $vax->id)->firstOrFail();
        $this->assertSame(ReminderText::VACCINATION_DUE, $reminder->template);
        $this->assertSame(['vaccine' => 'Rabies', 'pet' => 'Luna', 'due_date' => '2027-01-05'], $reminder->template_params);
        // The stored fallback is the exact English the scheduler always wrote.
        $this->assertSame('Vaccination due: Rabies', $reminder->title);
        $this->assertSame('Luna — Rabies is due Jan 5, 2027', $reminder->body);
        $this->assertSame('Vaccination due: Rabies', $reminder->localizedTitle('en'));
        $this->assertSame('Luna — Rabies is due Jan 5, 2027', $reminder->localizedBody('en'));

        $pet = $vax->pet;
        $med = Medication::create(['pet_id' => $pet->id, 'name' => 'Simparica', 'dosage' => '40mg', 'frequency' => 'daily', 'times' => ['08:00']]);
        ReminderScheduler::syncMedicationReminder($med);
        $medReminder = Reminder::where('related_id', $med->id)->firstOrFail();
        $this->assertSame(ReminderText::MEDICATION_DOSE, $medReminder->template);
        $this->assertSame('Medication: Simparica', $medReminder->title);
        $this->assertSame('Luna — 40mg', $medReminder->body);
        $this->assertSame("Médicament\u{00A0}: Simparica", $medReminder->localizedTitle('fr'));
        $this->assertSame('Medicamento: Simparica', $medReminder->localizedTitle('es'));
    }

    public function test_reminder_push_is_in_the_recipients_language_with_a_localized_date(): void
    {
        $this->travelTo('2026-12-29 10:00:00'); // the reminder fires 7 days before Jan 5

        $expected = [
            'en' => ['Vaccination due: Rabies', 'Luna — Rabies is due Jan 5, 2027'],
            'fr' => ["Vaccin prévu\u{00A0}: Rabies", 'Luna — Rabies, échéance le 5 janvier 2027'],
            'es' => ['Vacuna pendiente: Rabies', 'Luna — Rabies vence el 5 de enero de 2027'],
        ];

        $tokens = [];
        foreach (array_keys($expected) as $locale) {
            [$user] = $this->actingUser($locale);
            $this->withDevice($user);
            $tokens[$locale] = DeviceToken::where('user_id', $user->id)->value('token');
            ReminderScheduler::syncVaccinationReminder($this->vaccinationFor($user));
        }

        $this->artisan('reminders:send')->assertSuccessful();

        $byToken = collect($this->pushes())->keyBy('to');
        foreach ($expected as $locale => [$title, $body]) {
            $this->assertSame($title, $byToken[$tokens[$locale]]['title'], $locale);
            $this->assertSame($body, $byToken[$tokens[$locale]]['body'], $locale);
        }
    }

    public function test_a_first_of_the_month_due_date_uses_the_french_ordinal(): void
    {
        $this->travelTo('2026-12-25 10:00:00'); // the reminder fires 7 days before Jan 1

        [$user] = $this->actingUser('fr');
        $this->withDevice($user);
        ReminderScheduler::syncVaccinationReminder($this->vaccinationFor($user, due: '2027-01-01'));

        $this->artisan('reminders:send')->assertSuccessful();

        $this->assertSame('Luna — Rabies, échéance le 1er janvier 2027', $this->pushes()[0]['body']);

        // Only the 1st takes the ordinal in French; Spanish and English never do.
        $this->assertSame('1er mars 2027', ReminderText::dueDate('2027-03-01', 'fr'));
        $this->assertSame('2 mars 2027', ReminderText::dueDate('2027-03-02', 'fr'));
        $this->assertSame('21 mars 2027', ReminderText::dueDate('2027-03-21', 'fr'));
        $this->assertSame('1 de enero de 2027', ReminderText::dueDate('2027-01-01', 'es'));
        $this->assertSame('Jan 1, 2027', ReminderText::dueDate('2027-01-01', 'en'));
    }

    public function test_medication_push_without_dosage_is_just_the_pet_name(): void
    {
        [$user] = $this->actingUser('es');
        $this->withDevice($user);
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Michi']);
        $med = Medication::create(['pet_id' => $pet->id, 'name' => 'Apoquel', 'frequency' => 'daily', 'times' => ['08:00']]);
        ReminderScheduler::syncMedicationReminder($med);
        Reminder::where('related_id', $med->id)->update(['next_fire_at' => now()->subHour()]);

        $this->artisan('reminders:send')->assertSuccessful();

        $push = $this->pushes()[0];
        $this->assertSame('Medicamento: Apoquel', $push['title']);
        $this->assertSame('Michi', $push['body']);
    }

    public function test_a_user_created_reminder_is_never_translated(): void
    {
        [$user, $token] = $this->actingUser('fr');
        $this->withDevice($user);

        // Typed in English on purpose: a French user's own words stay as typed.
        $id = $this->withToken($token)->postJson('/reminders', [
            'title' => 'Vaccination due: Rabies',
            'body' => 'Buy more food',
            'schedule_type' => 'recurring',
            'recurrence' => 'daily',
        ])->assertCreated()
            ->assertJsonPath('title', 'Vaccination due: Rabies')
            ->assertJsonPath('body', 'Buy more food')
            ->json('id');

        $this->assertNull(Reminder::find($id)->template);
        $this->withToken($token)->getJson('/reminders')->assertOk()
            ->assertJsonPath('0.title', 'Vaccination due: Rabies')
            ->assertJsonPath('0.body', 'Buy more food');

        Reminder::whereKey($id)->update(['next_fire_at' => now()->subHour()]);
        $this->artisan('reminders:send')->assertSuccessful();
        $this->assertSame('Vaccination due: Rabies', $this->pushes()[0]['title']);
        $this->assertSame('Buy more food', $this->pushes()[0]['body']);

        // Nor does the backfill ever touch a custom reminder.
        $this->artisan('reminders:backfill-templates')->assertSuccessful();
        $this->assertNull(Reminder::find($id)->template);
    }

    public function test_reminders_api_and_inbox_render_in_the_request_users_locale(): void
    {
        [$owner, $ownerToken] = $this->actingUser('es');
        $vax = $this->vaccinationFor($owner, 'Rex', 'Moquillo');
        ReminderScheduler::syncVaccinationReminder($vax);

        $this->withToken($ownerToken)->getJson('/reminders')->assertOk()
            ->assertJsonPath('0.title', 'Vacuna pendiente: Moquillo')
            ->assertJsonPath('0.body', 'Rex — Moquillo vence el 5 de enero de 2027');

        // Switching language re-renders the same row; nothing is stored per language.
        $this->withToken($ownerToken)->patchJson('/users/me', ['locale' => 'fr'])->assertOk();
        $this->withToken($ownerToken)->getJson('/reminders')->assertOk()
            ->assertJsonPath('0.title', "Vaccin prévu\u{00A0}: Moquillo")
            ->assertJsonPath('0.body', 'Rex — Moquillo, échéance le 5 janvier 2027');

        // The notification inbox carries the same rendered text.
        $reminder = Reminder::where('related_id', $vax->id)->firstOrFail();
        ReminderDelivery::create(['reminder_id' => $reminder->id, 'occurrence_at' => now(), 'channel' => 'push', 'status' => 'sent', 'sent_at' => now()]);
        $this->withToken($ownerToken)->getJson('/notifications')->assertOk()
            ->assertJsonPath('notifications.0.title', "Vaccin prévu\u{00A0}: Moquillo");

        // An English user gets the original strings, byte for byte.
        [, $enToken] = $this->actingUser('en');
        $this->withToken($enToken)->getJson('/reminders')->assertOk()->assertJsonCount(0);
        $owner->forceFill(['locale' => 'en'])->save();
        $this->withToken($ownerToken)->getJson('/reminders')->assertOk()
            ->assertJsonPath('0.title', 'Vaccination due: Moquillo')
            ->assertJsonPath('0.body', 'Rex — Moquillo is due Jan 5, 2027');
    }

    public function test_editing_a_generated_reminders_text_freezes_it_as_the_users_own(): void
    {
        [$user, $token] = $this->actingUser('fr');
        $vax = $this->vaccinationFor($user);
        ReminderScheduler::syncVaccinationReminder($vax);
        $id = Reminder::where('related_id', $vax->id)->value('id');

        // Toggling, or sending the text back unchanged, keeps the template.
        $this->withToken($token)->patchJson("/reminders/{$id}", ['enabled' => true, 'title' => "Vaccin prévu\u{00A0}: Rabies"])->assertOk();
        $this->assertSame(ReminderText::VACCINATION_DUE, Reminder::find($id)->template);
        $this->assertSame('Vaccination due: Rabies', Reminder::find($id)->title);

        $this->withToken($token)->patchJson("/reminders/{$id}", ['title' => 'Vaccin de Luna'])
            ->assertOk()
            ->assertJsonPath('title', 'Vaccin de Luna')
            ->assertJsonPath('body', 'Luna — Rabies, échéance le 5 janvier 2027');

        $reminder = Reminder::find($id);
        $this->assertNull($reminder->template);
        $this->assertSame('Vaccin de Luna', $reminder->localizedTitle('es'));
        $this->assertSame('Luna — Rabies, échéance le 5 janvier 2027', $reminder->localizedBody('en'));
    }

    // ── Backfill of rows written before templates ───────────────────────────

    public function test_backfill_maps_the_known_english_patterns_and_leaves_the_rest(): void
    {
        [$user] = $this->actingUser('fr');
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna — Star']);
        $vax = Vaccination::create(['pet_id' => $pet->id, 'name' => 'Rabies', 'due_date' => '2027-01-05']);
        $withDose = Medication::create(['pet_id' => $pet->id, 'name' => 'Simparica', 'dosage' => '40mg', 'frequency' => 'daily', 'times' => ['08:00']]);
        $noDose = Medication::create(['pet_id' => $pet->id, 'name' => 'Apoquel', 'frequency' => 'daily', 'times' => ['08:00']]);
        $changedDose = Medication::create(['pet_id' => $pet->id, 'name' => 'Heartgard', 'dosage' => '2 chews', 'frequency' => 'daily', 'times' => ['08:00']]);

        $legacy = fn (array $attrs) => Reminder::create(array_merge([
            'user_id' => $user->id, 'pet_id' => $pet->id, 'schedule_type' => 'recurring', 'recurrence' => 'daily',
        ], $attrs))->id;

        $vaxRow = $legacy(['type' => 'vaccination', 'related_type' => 'vaccination', 'related_id' => $vax->id,
            'schedule_type' => 'one_time', 'title' => 'Vaccination due: Rabies', 'body' => 'Luna — Star — Rabies is due Jan 5, 2027']);
        // A spent reminder whose vaccination is gone still maps from its text.
        $orphanVax = $legacy(['type' => 'vaccination', 'related_type' => 'vaccination', 'related_id' => 'gone',
            'title' => 'Vaccination due: DHPP', 'body' => 'Luna — Star — DHPP is due Sep 30, 2026']);
        $medRow = $legacy(['type' => 'medication', 'related_type' => 'medication', 'related_id' => $withDose->id,
            'title' => 'Medication: Simparica', 'body' => 'Luna — Star — 40mg']);
        $noDoseRow = $legacy(['type' => 'medication', 'related_type' => 'medication', 'related_id' => $noDose->id,
            'title' => 'Medication: Apoquel', 'body' => 'Luna — Star']);

        // Unmappable: edited text, an unrecognised date, a dosage that no
        // longer matches its medication, and a custom reminder.
        $edited = $legacy(['type' => 'vaccination', 'related_type' => 'vaccination', 'related_id' => $vax->id,
            'title' => 'Rabies shot!', 'body' => 'Luna — Star — Rabies is due Jan 5, 2027']);
        $badDate = $legacy(['type' => 'vaccination', 'related_type' => 'vaccination', 'related_id' => $vax->id,
            'title' => 'Vaccination due: Rabies', 'body' => 'Luna — Rabies is due soon']);
        $staleDose = $legacy(['type' => 'medication', 'related_type' => 'medication', 'related_id' => $changedDose->id,
            'title' => 'Medication: Heartgard', 'body' => 'Luna — 1 chew']);
        $custom = $legacy(['type' => 'custom', 'title' => 'Medication: Simparica', 'body' => 'Luna — 40mg']);

        $this->artisan('reminders:backfill-templates')->assertSuccessful();
        $this->artisan('reminders:backfill-templates')->assertSuccessful(); // idempotent

        $r = fn ($id) => Reminder::find($id);
        $this->assertSame(ReminderText::VACCINATION_DUE, $r($vaxRow)->template);
        $this->assertSame(['vaccine' => 'Rabies', 'pet' => 'Luna — Star', 'due_date' => '2027-01-05'], $r($vaxRow)->template_params);
        $this->assertSame(['vaccine' => 'DHPP', 'pet' => 'Luna — Star', 'due_date' => '2026-09-30'], $r($orphanVax)->template_params);
        $this->assertSame(['medication' => 'Simparica', 'pet' => 'Luna — Star', 'dosage' => '40mg'], $r($medRow)->template_params);
        $this->assertSame(['medication' => 'Apoquel', 'pet' => 'Luna — Star', 'dosage' => null], $r($noDoseRow)->template_params);

        foreach ([$edited, $badDate, $staleDose, $custom] as $id) {
            $this->assertNull($r($id)->template);
            $this->assertNull($r($id)->template_params);
        }

        // Mapped rows read in French now; English is unchanged byte for byte.
        $this->assertSame('Luna — Star — Rabies, échéance le 5 janvier 2027', $r($vaxRow)->localizedBody('fr'));
        $this->assertSame('Luna — Star — Rabies is due Jan 5, 2027', $r($vaxRow)->localizedBody('en'));
        $this->assertSame('Luna — Star — 40mg', $r($medRow)->localizedBody('fr'));
        $this->assertSame('Rabies shot!', $r($edited)->localizedTitle('fr'));
    }

    public function test_backfill_runs_as_a_migration(): void
    {
        $this->assertContains(
            '2026_10_16_000003_backfill_reminder_templates',
            \DB::table('migrations')->pluck('migration')->all(),
        );
    }

    public function test_unknown_template_or_broken_params_fall_back_to_stored_text(): void
    {
        [$user] = $this->actingUser('fr');
        $reminder = Reminder::create([
            'user_id' => $user->id, 'type' => 'vaccination', 'title' => 'Stored title', 'body' => 'Stored body',
            'schedule_type' => 'one_time', 'template' => 'nope', 'template_params' => ['vaccine' => 'X'],
        ]);
        $this->assertSame('Stored title', $reminder->localizedTitle());
        $this->assertSame('Stored body', $reminder->localizedBody());

        $reminder->template = ReminderText::VACCINATION_DUE; // params lack pet + due_date
        $this->assertSame('Stored title', $reminder->localizedTitle());
        $this->assertSame('Stored body', $reminder->localizedBody());
    }

    // ── Engagement pushes ───────────────────────────────────────────────────

    public function test_birthday_and_gotcha_day_pushes_use_the_users_language_and_plurals(): void
    {
        $cases = [
            // locale, birthday year, adopted year → birthday title/body, gotcha body
            ['en', '2024-08-24', '2025-08-24', 'Happy birthday, Luna!', 'Luna turns 2 today.', 'One year with Luna today.'],
            ['fr', '2025-08-24', '2023-08-24', "Joyeux anniversaire, Luna\u{00A0}!", "Luna a 1 an aujourd'hui.", "3 ans avec Luna aujourd'hui."],
            ['es', '2023-08-24', '2025-08-24', '¡Feliz cumpleaños, Luna!', 'Luna cumple 3 años hoy.', 'Hoy se cumple un año con Luna.'],
            ['es', '2025-08-24', '2022-08-24', '¡Feliz cumpleaños, Luna!', 'Luna cumple 1 año hoy.', 'Hoy se cumplen 4 años con Luna.'],
        ];

        foreach ($cases as [$locale, $birthday, $adopted, $title, $body, $gotcha]) {
            Http::fake(['exp.host/*' => Http::response(['data' => []])]);
            \DB::table('engagement_pushes')->delete();
            DeviceToken::query()->delete();
            [$user] = $this->actingUser($locale);
            $this->withDevice($user);
            Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'birthday' => $birthday, 'adopted_on' => $adopted]);

            $this->travelTo('2026-08-24 09:30:00');
            $this->artisan('engagement:send')->assertSuccessful();

            $pushes = collect($this->pushes())->keyBy(fn ($p) => $p['data']['kind']);
            $this->assertSame($title, $pushes['birthday']['title'], $locale);
            $this->assertSame($body, $pushes['birthday']['body'], $locale);
            $this->assertSame($locale === 'en' ? 'Gotcha day!' : ($locale === 'fr' ? "Jour d'adoption\u{00A0}!" : '¡Día de adopción!'), $pushes['gotcha_day']['title']);
            $this->assertSame($gotcha, $pushes['gotcha_day']['body'], $locale);
            $this->travelBack();
        }
    }

    public function test_weekly_recap_uses_the_users_language_and_plurals(): void
    {
        $cases = [
            ['en', 1, 'Your week in care', '1 care action across 1 pet this week.'],
            ['fr', 1, 'Votre semaine de soins', '1 soin effectué pour 1 animal cette semaine.'],
            ['fr', 3, 'Votre semaine de soins', '3 soins effectués pour 1 animal cette semaine.'],
            ['es', 2, 'Su semana de cuidados', '2 acciones de cuidados para 1 mascota esta semana.'],
        ];

        foreach ($cases as [$locale, $weights, $title, $body]) {
            Http::fake(['exp.host/*' => Http::response(['data' => []])]);
            \DB::table('engagement_pushes')->delete();
            DeviceToken::query()->delete();
            [$user] = $this->actingUser($locale);
            $this->withDevice($user);
            $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna']);

            // Sunday 2026-08-23, 18:30 UTC (recap hour), with weigh-ins this week.
            $this->travelTo('2026-08-23 18:30:00');
            for ($i = 0; $i < $weights; $i++) {
                WeightLog::create(['pet_id' => $pet->id, 'weight' => 10 + $i, 'unit' => 'kg', 'logged_at' => now()->subDays($i + 1)]);
            }
            $this->artisan('engagement:send')->assertSuccessful();

            $push = collect($this->pushes())->firstWhere('data.kind', 'weekly_recap');
            $this->assertNotNull($push, $locale);
            $this->assertSame($title, $push['title'], $locale);
            $this->assertSame($body, $push['body'], $locale);
            $this->travelBack();
        }
    }
}
