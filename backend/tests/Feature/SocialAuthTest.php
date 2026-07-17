<?php

namespace Tests\Feature;

use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SocialAuthTest extends TestCase
{
    use RefreshDatabase;

    private const GOOGLE_AUD = 'test-google-web-client.apps.googleusercontent.com';

    private const APPLE_AUD = 'com.pawpawcare.app';

    private const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

    private const APPLE_CERTS = 'https://appleid.apple.com/auth/keys';

    private string $privatePem;

    private array $jwk; // public key as a JWK (kid = "test-kid")

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.google.client_id' => self::GOOGLE_AUD,
            'services.apple.bundle_id' => self::APPLE_AUD,
        ]);

        [$this->privatePem, $this->jwk] = $this->makeKeyPair('test-kid');
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Generate an RSA keypair; return [privatePem, publicJwk]. */
    private function makeKeyPair(string $kid): array
    {
        $res = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        openssl_pkey_export($res, $privatePem);
        $d = openssl_pkey_get_details($res);

        $b64 = fn (string $bin): string => rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');

        return [$privatePem, [
            'kty' => 'RSA',
            'use' => 'sig',
            'alg' => 'RS256',
            'kid' => $kid,
            'n' => $b64($d['rsa']['n']),
            'e' => $b64($d['rsa']['e']),
        ]];
    }

    /** Fake the provider's JWKS endpoint to advertise a given public JWK. */
    private function fakeCerts(string $url, ?array $jwk = null): void
    {
        Http::fake([$url => Http::response(['keys' => [$jwk ?? $this->jwk]])]);
    }

    private function sign(array $claims, ?string $privatePem = null, string $kid = 'test-kid'): string
    {
        $claims += ['iat' => time(), 'exp' => time() + 3600];

        return JWT::encode($claims, $privatePem ?? $this->privatePem, 'RS256', $kid);
    }

    private function googleClaims(array $overrides = []): array
    {
        return array_merge([
            'iss' => 'https://accounts.google.com',
            'aud' => self::GOOGLE_AUD,
            'sub' => 'google-sub-123',
            'email' => 'newuser@gmail.com',
            'email_verified' => true,
            'name' => 'New Google User',
        ], $overrides);
    }

    // ── Google ───────────────────────────────────────────────────────────────

    public function test_google_sign_in_creates_a_new_user_and_issues_tokens(): void
    {
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims())])
            ->assertOk()
            ->assertJsonStructure(['access_token', 'refresh_token', 'token_type']);

        $this->assertDatabaseHas('users', [
            'email' => 'newuser@gmail.com',
            'provider' => 'google',
            'provider_id' => 'google-sub-123',
        ]);
        $this->assertNull(User::where('email', 'newuser@gmail.com')->first()->hashed_password);
    }

    public function test_google_links_to_existing_account_by_verified_email(): void
    {
        $existing = User::create([
            'name' => 'Existing',
            'email' => 'existing@gmail.com',
            'hashed_password' => Hash::make('secret123'),
        ]);
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', [
            'id_token' => $this->sign($this->googleClaims(['email' => 'existing@gmail.com', 'sub' => 'g-999'])),
        ])->assertOk();

        $existing->refresh();
        $this->assertSame('google', $existing->provider);
        $this->assertSame('g-999', $existing->provider_id);
        $this->assertSame(1, User::where('email', 'existing@gmail.com')->count());
        // Linking invalidates the pre-existing password (pre-hijack guard).
        $this->assertNull($existing->hashed_password);
    }

    public function test_google_sign_in_reactivates_a_pending_deletion(): void
    {
        // A returning social user whose account is disabled only because they
        // requested deletion: signing back in during the grace period cancels
        // the deletion (mirrors the email-login path in AccountDeletionTest).
        $user = User::create([
            'name' => 'Coming Back',
            'email' => 'comeback@gmail.com',
            'hashed_password' => null,
            'provider' => 'google',
            'provider_id' => 'g-comeback',
            'is_active' => false,
        ]);
        $user->forceFill(['deletion_requested_at' => now()->subDay()])->save();

        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', [
            'id_token' => $this->sign($this->googleClaims(['email' => 'comeback@gmail.com', 'sub' => 'g-comeback'])),
        ])->assertOk()->assertJson(['reactivated' => true]);

        $user->refresh();
        $this->assertTrue($user->is_active);
        $this->assertNull($user->deletion_requested_at);
    }

    public function test_google_link_evicts_a_preregistered_password_and_sessions(): void
    {
        // Simulate an account pre-hijack: someone registered the victim's email
        // with a password they chose (signup never proves email ownership).
        $preRegistered = User::create([
            'name' => 'Attacker',
            'email' => 'victim@gmail.com',
            'hashed_password' => Hash::make('attacker-password'),
        ]);
        $this->fakeCerts(self::GOOGLE_CERTS);

        // The real victim signs in with Google (provider-verified email).
        $this->postJson('/auth/google', [
            'id_token' => $this->sign($this->googleClaims(['email' => 'victim@gmail.com', 'sub' => 'victim-sub'])),
        ])->assertOk();

        // The attacker's password no longer works — the account is the victim's.
        $this->postJson('/auth/login', [
            'email' => 'victim@gmail.com',
            'password' => 'attacker-password',
        ])->assertStatus(401);

        $preRegistered->refresh();
        $this->assertNull($preRegistered->hashed_password);
        $this->assertSame('victim-sub', $preRegistered->provider_id);
    }

    public function test_returning_google_user_reuses_the_same_account(): void
    {
        $this->fakeCerts(self::GOOGLE_CERTS);
        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims())])->assertOk();
        // Same sub, different email on return — must resolve to the same user.
        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims(['email' => 'changed@gmail.com']))])->assertOk();

        $this->assertSame(1, User::where('provider_id', 'google-sub-123')->count());
    }

    public function test_google_rejects_wrong_audience(): void
    {
        $this->fakeCerts(self::GOOGLE_CERTS);
        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims(['aud' => 'someone-else']))])
            ->assertStatus(401);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_google_rejects_wrong_issuer(): void
    {
        $this->fakeCerts(self::GOOGLE_CERTS);
        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims(['iss' => 'https://evil.example']))])
            ->assertStatus(401);
    }

    public function test_google_rejects_a_token_signed_by_the_wrong_key(): void
    {
        // JWKS advertises our key; token is signed by a different one.
        [$otherPem] = $this->makeKeyPair('test-kid');
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims(), $otherPem)])
            ->assertStatus(401);
    }

    public function test_google_unverified_email_does_not_link_to_existing_account(): void
    {
        $existing = User::create([
            'name' => 'Owner',
            'email' => 'owner@gmail.com',
            'hashed_password' => Hash::make('secret123'),
        ]);
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', [
            'id_token' => $this->sign($this->googleClaims(['email' => 'owner@gmail.com', 'email_verified' => false, 'sub' => 'attacker'])),
        ])->assertOk();

        // The password account is untouched; a separate (placeholder-email) user is created.
        $existing->refresh();
        $this->assertNull($existing->provider);
        $this->assertSame(2, User::count());
    }

    public function test_google_disabled_account_is_rejected_without_mutation(): void
    {
        // A disabled account must not have its password nulled / sessions revoked
        // as a side effect of a sign-in it isn't allowed to complete.
        $disabled = User::create([
            'name' => 'Disabled',
            'email' => 'disabled@gmail.com',
            'hashed_password' => Hash::make('secret123'),
            'is_active' => false,
        ]);
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', [
            'id_token' => $this->sign($this->googleClaims(['email' => 'disabled@gmail.com', 'sub' => 'g-dis'])),
        ])->assertStatus(403);

        $disabled->refresh();
        $this->assertNull($disabled->provider);
        $this->assertNotNull($disabled->hashed_password); // password preserved
    }

    public function test_google_is_503_when_audience_not_configured(): void
    {
        config(['services.google.client_id' => null]);
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims())])
            ->assertStatus(503);
    }

    public function test_google_rejects_an_expired_token_without_refetching_keys(): void
    {
        $this->fakeCerts(self::GOOGLE_CERTS);

        $this->postJson('/auth/google', [
            'id_token' => $this->sign($this->googleClaims(['exp' => time() - 3600])),
        ])->assertStatus(401);

        // An expired token must NOT trigger a JWKS refetch — the keys are fetched
        // exactly once (the initial cache fill), never again on a bad token.
        Http::assertSentCount(1);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_google_is_503_when_provider_jwks_is_unavailable(): void
    {
        Http::fake([self::GOOGLE_CERTS => Http::response('', 500)]);

        $this->postJson('/auth/google', ['id_token' => $this->sign($this->googleClaims())])
            ->assertStatus(503);
        $this->assertDatabaseCount('users', 0);
    }

    // ── Apple ────────────────────────────────────────────────────────────────

    public function test_apple_sign_in_creates_user_and_verifies_nonce(): void
    {
        $this->fakeCerts(self::APPLE_CERTS);
        $rawNonce = 'random-nonce-value';

        $token = $this->sign([
            'iss' => 'https://appleid.apple.com',
            'aud' => self::APPLE_AUD,
            'sub' => 'apple-sub-1',
            'email' => 'user@privaterelay.appleid.com',
            'email_verified' => 'true',
            'nonce' => hash('sha256', $rawNonce),
        ]);

        $this->postJson('/auth/apple', [
            'identity_token' => $token,
            'raw_nonce' => $rawNonce,
            'full_name' => 'Apple Person',
        ])->assertOk()->assertJsonStructure(['access_token']);

        $this->assertDatabaseHas('users', ['provider' => 'apple', 'provider_id' => 'apple-sub-1']);
    }

    public function test_apple_rejects_a_mismatched_nonce(): void
    {
        $this->fakeCerts(self::APPLE_CERTS);

        $token = $this->sign([
            'iss' => 'https://appleid.apple.com',
            'aud' => self::APPLE_AUD,
            'sub' => 'apple-sub-2',
            'nonce' => hash('sha256', 'the-real-nonce'),
        ]);

        $this->postJson('/auth/apple', [
            'identity_token' => $token,
            'raw_nonce' => 'a-different-nonce',
        ])->assertStatus(401);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_apple_rejects_wrong_audience(): void
    {
        $this->fakeCerts(self::APPLE_CERTS);
        $rawNonce = 'random-nonce-value';
        $token = $this->sign([
            'iss' => 'https://appleid.apple.com',
            'aud' => 'com.someone.else',
            'sub' => 'apple-sub-3',
            'nonce' => hash('sha256', $rawNonce),
        ]);

        $this->postJson('/auth/apple', ['identity_token' => $token, 'raw_nonce' => $rawNonce])
            ->assertStatus(401);
    }

    public function test_apple_requires_a_nonce(): void
    {
        $this->fakeCerts(self::APPLE_CERTS);
        $token = $this->sign([
            'iss' => 'https://appleid.apple.com',
            'aud' => self::APPLE_AUD,
            'sub' => 'apple-sub-4',
            'nonce' => hash('sha256', 'some-nonce'),
        ]);

        // Omitting raw_nonce must be rejected outright (replay guard), never
        // silently accepted as it was before.
        $this->postJson('/auth/apple', ['identity_token' => $token])
            ->assertStatus(422);
        $this->assertDatabaseCount('users', 0);
    }
}
