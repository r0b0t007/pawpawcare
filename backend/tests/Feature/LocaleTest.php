<?php

namespace Tests\Feature;

use App\Http\Controllers\AuthController;
use App\Http\Middleware\JwtAuth;
use App\Http\Middleware\SetLocale;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * API messages follow the signed-in user's saved locale, else the
 * Accept-Language header, else English (SetLocale, bootstrap/app.php).
 */
class LocaleTest extends TestCase
{
    use RefreshDatabase;

    private function actingUser(?string $locale = null): array
    {
        $user = User::create([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        if ($locale !== null) {
            $user->forceFill(['locale' => $locale])->save();
        }

        return [$user->fresh(), JwtService::createAccessToken($user->id)];
    }

    private function badLogin(array $headers = [])
    {
        // Per-request headers (not withHeaders, which sticks for the test).
        return $this->postJson('/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'wrong-password',
        ], $headers);
    }

    // ── Public routes: Accept-Language only ─────────────────────────────────

    public function test_public_route_error_follows_accept_language_french(): void
    {
        $this->badLogin(['Accept-Language' => 'fr-FR,fr;q=0.9,en;q=0.8'])
            ->assertStatus(401)
            ->assertExactJson(['detail' => 'Adresse e-mail ou mot de passe incorrect']);
    }

    public function test_public_route_error_follows_accept_language_spanish(): void
    {
        $this->badLogin(['Accept-Language' => 'es-ES,es;q=0.9'])
            ->assertStatus(401)
            ->assertExactJson(['detail' => 'Correo electrónico o contraseña incorrectos']);
    }

    public function test_unsupported_or_missing_language_falls_back_to_english(): void
    {
        $this->badLogin(['Accept-Language' => 'de-DE,de;q=0.9,ja;q=0.8'])
            ->assertStatus(401)
            ->assertExactJson(['detail' => 'Invalid email or password']);

        $this->badLogin()
            ->assertStatus(401)
            ->assertExactJson(['detail' => 'Invalid email or password']);
    }

    public function test_a_french_request_does_not_leak_into_the_next_one(): void
    {
        $this->badLogin(['Accept-Language' => 'fr'])->assertJsonPath('detail', 'Adresse e-mail ou mot de passe incorrect');

        $this->badLogin()->assertJsonPath('detail', 'Invalid email or password');
    }

    public function test_validation_messages_are_translated_with_attribute_names(): void
    {
        $this->postJson('/auth/signup', ['email' => 'new@example.com', 'password' => 'secret123'], ['Accept-Language' => 'fr'])
            ->assertStatus(422)
            ->assertExactJson(['detail' => 'Le champ nom est obligatoire.']);

        $this->postJson('/auth/signup', ['email' => 'new@example.com', 'password' => 'secret123'], ['Accept-Language' => 'es'])
            ->assertStatus(422)
            ->assertExactJson(['detail' => 'El campo nombre es obligatorio.']);

        // English stays Laravel's default wording.
        $this->postJson('/auth/signup', ['email' => 'new@example.com', 'password' => 'secret123'])
            ->assertStatus(422)
            ->assertExactJson(['detail' => 'The name field is required.']);
    }

    public function test_jwt_rejection_follows_accept_language(): void
    {
        $this->getJson('/users/me', ['Accept-Language' => 'fr'])
            ->assertStatus(401)
            ->assertExactJson(['detail' => "Jeton d'accès non valide ou expiré"]);

        $this->getJson('/users/me')
            ->assertStatus(401)
            ->assertExactJson(['detail' => 'Invalid or expired access token']);
    }

    public function test_an_expired_signed_link_follows_accept_language(): void
    {
        [$user] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
        $expired = URL::temporarySignedRoute('pets.share', now()->subMinute(), ['pet' => $pet->id]);

        $this->getJson($expired, ['Accept-Language' => 'fr-FR,fr;q=0.9'])
            ->assertForbidden()
            ->assertExactJson(['detail' => "Ce lien a expiré ou n'est pas valide."]);

        $this->getJson($expired, ['Accept-Language' => 'es-ES'])
            ->assertForbidden()
            ->assertExactJson(['detail' => 'Este enlace ha caducado o no es válido.']);

        // English keeps the framework's wording.
        $this->getJson($expired)
            ->assertForbidden()
            ->assertExactJson(['detail' => 'Invalid signature.']);
    }

    // ── Authenticated routes: the saved locale wins ─────────────────────────

    public function test_authenticated_error_uses_the_users_saved_locale_over_the_header(): void
    {
        [, $token] = $this->actingUser('fr');
        $missing = (string) Str::uuid();

        $this->withToken($token)->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])
            ->getJson("/pets/{$missing}/weights")
            ->assertNotFound()
            ->assertExactJson(['detail' => 'Animal introuvable']);
    }

    public function test_authenticated_validation_uses_the_saved_locale_including_relative_dates(): void
    {
        [$user, $token] = $this->actingUser('es');
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'weight_unit' => 'kg']);

        $this->withToken($token)
            ->postJson("/pets/{$pet->id}/weights", ['weight' => 12, 'logged_at' => now()->addDays(3)->toDateString()])
            ->assertStatus(422)
            ->assertExactJson(['detail' => 'El campo fecha de registro debe ser una fecha anterior o igual a hoy.']);

        $user->forceFill(['locale' => 'fr'])->save();
        $this->withToken($token)
            ->postJson("/pets/{$pet->id}/weights", ['weight' => 12, 'logged_at' => now()->addDays(3)->toDateString()])
            ->assertStatus(422)
            ->assertExactJson(['detail' => "Le champ date d'enregistrement doit être une date antérieure ou égale à aujourd'hui."]);
    }

    public function test_reminder_and_dose_validation_has_no_english_fragments(): void
    {
        [$user, $token] = $this->actingUser('fr');
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
        $med = Medication::create(['pet_id' => $pet->id, 'name' => 'Simparica', 'times' => ['08:00']]);
        $past = now()->subHour()->toIso8601String();
        $future = now()->addHour()->toIso8601String();

        $expected = [
            'fr' => [
                'Le champ date du rappel doit être une date postérieure à maintenant.',
                'Le champ date du rappel est obligatoire lorsque type de rappel vaut ponctuel.',
                'Le champ récurrence est obligatoire lorsque type de rappel vaut récurrent.',
                'Le champ date de la prise doit être une date antérieure ou égale à maintenant.',
            ],
            'es' => [
                'El campo fecha del recordatorio debe ser una fecha posterior a ahora.',
                'El campo fecha del recordatorio es obligatorio cuando tipo de recordatorio sea puntual.',
                'El campo recurrencia es obligatorio cuando tipo de recordatorio sea periódico.',
                'El campo fecha de la toma debe ser una fecha anterior o igual a ahora.',
            ],
        ];

        foreach ($expected as $locale => [$afterNow, $oneTime, $recurring, $dose]) {
            $user->forceFill(['locale' => $locale])->save();

            $this->withToken($token)
                ->postJson('/reminders', ['title' => 'Vet', 'schedule_type' => 'one_time', 'fire_at' => $past])
                ->assertStatus(422)->assertExactJson(['detail' => $afterNow]);
            $this->withToken($token)
                ->postJson('/reminders', ['title' => 'Vet', 'schedule_type' => 'one_time'])
                ->assertStatus(422)->assertExactJson(['detail' => $oneTime]);
            $this->withToken($token)
                ->postJson('/reminders', ['title' => 'Vet', 'schedule_type' => 'recurring'])
                ->assertStatus(422)->assertExactJson(['detail' => $recurring]);
            $this->withToken($token)
                ->postJson("/pets/{$pet->id}/medications/{$med->id}/log", ['administered_at' => $future])
                ->assertStatus(422)->assertExactJson(['detail' => $dose]);
        }
    }

    public function test_upgrade_required_translates_detail_but_keeps_machine_codes(): void
    {
        [$user, $token] = $this->actingUser('fr');
        $user->forceFill(['email_verified_at' => now()])->save();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
        config(['entitlements.paywall_enabled' => true, 'entitlements.gates.care_links' => true]);

        $this->withToken($token)->postJson("/pets/{$pet->id}/care-link")
            ->assertStatus(402)
            ->assertExactJson([
                'detail' => 'Cette fonctionnalité nécessite PawPawCare Plus.',
                'code' => 'upgrade_required',
                'feature' => 'care_links',
            ]);
    }

    public function test_an_english_user_gets_english_even_with_a_french_header(): void
    {
        [, $token] = $this->actingUser();

        $this->withToken($token)->withHeaders(['Accept-Language' => 'fr'])
            ->getJson('/pets/'.Str::uuid().'/weights')
            ->assertNotFound()
            ->assertExactJson(['detail' => 'Pet not found']);
    }

    public function test_route_set_locale_is_sorted_after_jwt_auth_and_before_throttles_and_bindings(): void
    {
        // Building the HTTP kernel syncs its middleware groups and priority
        // list onto the router, as handling a real request would.
        $kernel = $this->app->make(Kernel::class);
        $router = $this->app['router'];
        $route = $router->getRoutes()->match(Request::create('/users/me', 'GET'));
        $order = array_map(fn ($m) => explode(':', $m)[0], $router->gatherRouteMiddleware($route));

        $at = fn (string $class) => array_search($class, $order, true);
        $this->assertNotFalse($at(SetLocale::class), 'SetLocale missing from the api group');
        $this->assertLessThan($at(SetLocale::class), $at(JwtAuth::class));
        $this->assertLessThan($at(ThrottleRequests::class), $at(SetLocale::class));
        $this->assertLessThan($at(SubstituteBindings::class), $at(SetLocale::class));

        // And globally, so requests that never reach a route still get it.
        $this->assertContains(SetLocale::class, $kernel->getGlobalMiddleware());
    }

    // ── Storing the preference ──────────────────────────────────────────────

    public function test_new_accounts_default_to_english_and_users_me_exposes_it(): void
    {
        [, $token] = $this->actingUser();

        $this->withToken($token)->getJson('/users/me')->assertOk()->assertJsonPath('locale', 'en');
    }

    public function test_patch_users_me_sets_a_supported_locale_and_switches_messages(): void
    {
        [$user, $token] = $this->actingUser();

        $this->withToken($token)->patchJson('/users/me', ['locale' => 'fr'])
            ->assertOk()->assertJsonPath('locale', 'fr');
        $this->assertSame('fr', $user->fresh()->locale);

        $this->withToken($token)->getJson('/pets/'.Str::uuid().'/weights')
            ->assertExactJson(['detail' => 'Animal introuvable']);
    }

    public function test_patch_users_me_rejects_unsupported_or_empty_locales(): void
    {
        [$user, $token] = $this->actingUser('es');

        foreach (['de', 'fr-FR', 'EN', '', null, ['fr']] as $value) {
            $this->withToken($token)->patchJson('/users/me', ['locale' => $value])
                ->assertStatus(422);
        }
        $this->assertSame('es', $user->fresh()->locale);

        // The rejection itself is in the user's language.
        $this->withToken($token)->patchJson('/users/me', ['locale' => 'de'])
            ->assertExactJson(['detail' => 'El valor seleccionado en idioma no es válido.']);
    }

    public function test_device_registration_stores_the_app_locale(): void
    {
        [$user, $token] = $this->actingUser();

        $this->withToken($token)->postJson('/devices', ['token' => 'ExponentPushToken[a]', 'locale' => 'es'])
            ->assertOk();
        $this->assertSame('es', $user->fresh()->locale);

        // Omitted (older app builds): unchanged.
        $this->withToken($token)->postJson('/devices', ['token' => 'ExponentPushToken[a]'])->assertOk();
        $this->assertSame('es', $user->fresh()->locale);

        $this->withToken($token)->postJson('/devices', ['token' => 'ExponentPushToken[a]', 'locale' => 'de'])
            ->assertStatus(422);
        $this->assertSame('es', $user->fresh()->locale);
    }

    public function test_locale_is_not_mass_assignable(): void
    {
        $this->assertNotContains('locale', (new User)->getFillable());

        // A `locale` in the body is ignored; only the request language counts.
        $this->postJson('/auth/signup', [
            'name' => 'Ana', 'email' => 'ana@example.com', 'password' => 'secret123', 'locale' => 'fr',
        ])->assertCreated();
        $this->assertSame('en', User::where('email', 'ana@example.com')->first()->locale);
    }

    public function test_a_new_account_starts_in_the_language_it_signed_up_in(): void
    {
        $token = $this->postJson('/auth/signup', [
            'name' => 'Ana', 'email' => 'ana@example.com', 'password' => 'secret123', 'locale' => 'fr',
        ], ['Accept-Language' => 'es-ES,es;q=0.9'])->assertCreated()->json('access_token');
        $this->assertSame('es', User::where('email', 'ana@example.com')->first()->locale);

        // Signed in, the account's errors stay Spanish without the header.
        $this->withToken($token)->getJson('/pets/'.Str::uuid().'/weights')
            ->assertExactJson(['detail' => __('Pet not found', [], 'es')]);
    }

    public function test_a_new_social_account_starts_in_the_request_language(): void
    {
        // Called directly: the sign-in endpoints need RSA test keys, and the
        // account-creation branch is the part that sets the locale.
        $login = new \ReflectionMethod(AuthController::class, 'loginSocialUser');

        App::setLocale('fr');
        [$created] = $login->invoke(app(AuthController::class), 'google', 'sub-fr', 'marie@example.com', true, 'Marie');
        $this->assertSame('fr', $created->fresh()->locale);

        // A returning user keeps the saved choice whatever the request says.
        $created->forceFill(['locale' => 'es'])->save();
        App::setLocale('en');
        [$returning] = $login->invoke(app(AuthController::class), 'google', 'sub-fr', 'marie@example.com', true, 'Marie');
        $this->assertSame($created->id, $returning->id);
        $this->assertSame('es', $returning->fresh()->locale);
    }

    // ── Accept-Language parsing ─────────────────────────────────────────────

    public function test_accept_language_parsing(): void
    {
        $cases = [
            'fr' => 'fr',
            'fr-FR' => 'fr',
            'FR-ca' => 'fr',
            'es_ES' => 'es',
            'es-MX,es;q=0.9' => 'es',
            'de-DE,de;q=0.9,es;q=0.8,fr;q=0.7' => 'es',
            'fr;q=0.5, es;q=0.8' => 'es',
            'es;q=0.5, fr;q=0.5' => 'es',
            'fr;q=0, es' => 'es',
            'en-GB,fr;q=0.9' => 'en',
            'de, ja, *' => null,
            'fr;q=0' => null,
            '' => null,
        ];

        foreach ($cases as $header => $expected) {
            $this->assertSame($expected, SetLocale::fromAcceptLanguage($header), "Accept-Language: {$header}");
        }
        $this->assertNull(SetLocale::fromAcceptLanguage(null));
    }

    // ── Translation files ───────────────────────────────────────────────────

    public function test_french_and_spanish_json_files_have_the_same_keys(): void
    {
        $fr = $this->jsonLines('fr');
        $es = $this->jsonLines('es');

        $this->assertSame([], array_values(array_diff(array_keys($fr), array_keys($es))), 'In fr.json but not es.json');
        $this->assertSame([], array_values(array_diff(array_keys($es), array_keys($fr))), 'In es.json but not fr.json');

        foreach ([$fr, $es] as $lines) {
            foreach ($lines as $key => $value) {
                $this->assertIsString($value);
                $this->assertNotSame('', trim($value), "Empty translation for: {$key}");
            }
        }
    }

    public function test_every_translated_api_message_has_french_and_spanish_entries(): void
    {
        // The framework's throttle and signed-URL messages, translated in bootstrap/app.php.
        $keys = ['Too Many Attempts.', 'Invalid signature.'];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path()));
        foreach ([...iterator_to_array($files), new \SplFileInfo(base_path('bootstrap/app.php'))] as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                preg_match_all("/__\\('((?:[^'\\\\]|\\\\.)*)'\\)/", file_get_contents($file->getPathname()), $m);
                array_push($keys, ...array_map('stripslashes', $m[1]));
            }
        }
        $keys = array_unique($keys);
        $this->assertGreaterThan(40, count($keys));

        foreach (['fr', 'es'] as $locale) {
            $missing = array_values(array_diff($keys, array_keys($this->jsonLines($locale))));
            $this->assertSame([], $missing, "Missing from lang/{$locale}.json");
        }
    }

    public function test_php_lang_files_cover_every_english_line(): void
    {
        foreach (['auth', 'pagination', 'passwords', 'validation'] as $group) {
            $en = array_keys(Arr::dot(require lang_path("en/{$group}.php")));
            foreach (['fr', 'es'] as $locale) {
                $lines = Arr::dot(require lang_path("{$locale}/{$group}.php"));
                $missing = array_values(array_filter($en, fn ($k) => ! array_key_exists($k, $lines) && ! str_starts_with($k, 'attributes')));
                $this->assertSame([], $missing, "lang/{$locale}/{$group}.php is missing lines");
            }
        }
    }

    private function jsonLines(string $locale): array
    {
        return json_decode(file_get_contents(lang_path("{$locale}.json")), true, 512, JSON_THROW_ON_ERROR);
    }
}
