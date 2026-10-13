<?php

namespace Tests\Feature;

use App\Models\DeviceToken;
use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $email): User
    {
        return User::create([
            'name' => 'Logout Tester',
            'email' => $email,
            'hashed_password' => Hash::make('password1'),
            'timezone' => 'UTC',
        ]);
    }

    private function login(User $user): array
    {
        return $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password1',
        ])->assertOk()->json();
    }

    public function test_logout_revokes_the_refresh_token(): void
    {
        $tokens = $this->login($this->user('a@example.com'));

        $this->postJson('/auth/logout', ['refresh_token' => $tokens['refresh_token']])->assertNoContent();

        $this->assertTrue((bool) RefreshToken::where('token', $tokens['refresh_token'])->value('revoked'));
        $this->postJson('/auth/refresh', ['refresh_token' => $tokens['refresh_token']])->assertUnauthorized();
    }

    // The app retries a sign-out made offline later, with no access token, so
    // the device is unregistered through the refresh token instead.
    public function test_logout_unregisters_the_device_without_an_access_token(): void
    {
        $user = $this->user('a@example.com');
        $tokens = $this->login($user);
        DeviceToken::create(['user_id' => $user->id, 'token' => 'ExponentPushToken[a]', 'platform' => 'android']);

        $this->postJson('/auth/logout', [
            'refresh_token' => $tokens['refresh_token'],
            'device_token' => 'ExponentPushToken[a]',
        ])->assertNoContent();

        $this->assertDatabaseMissing('device_tokens', ['token' => 'ExponentPushToken[a]']);
    }

    public function test_logout_cannot_unregister_another_accounts_device(): void
    {
        $alice = $this->user('alice@example.com');
        $bob = $this->user('bob@example.com');
        $aliceTokens = $this->login($alice);
        DeviceToken::create(['user_id' => $bob->id, 'token' => 'ExponentPushToken[bob]', 'platform' => 'ios']);

        $this->postJson('/auth/logout', [
            'refresh_token' => $aliceTokens['refresh_token'],
            'device_token' => 'ExponentPushToken[bob]',
        ])->assertNoContent();

        $this->assertDatabaseHas('device_tokens', ['token' => 'ExponentPushToken[bob]', 'user_id' => $bob->id]);
    }

    public function test_an_unknown_refresh_token_unregisters_nothing(): void
    {
        $user = $this->user('a@example.com');
        DeviceToken::create(['user_id' => $user->id, 'token' => 'ExponentPushToken[a]', 'platform' => 'android']);

        $this->postJson('/auth/logout', [
            'refresh_token' => 'not-a-real-token',
            'device_token' => 'ExponentPushToken[a]',
        ])->assertNoContent();

        $this->assertDatabaseHas('device_tokens', ['token' => 'ExponentPushToken[a]']);
    }
}
