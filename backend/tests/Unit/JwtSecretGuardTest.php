<?php

namespace Tests\Unit;

use App\Support\JwtSecretGuard;
use PHPUnit\Framework\TestCase;

class JwtSecretGuardTest extends TestCase
{
    public function test_the_placeholder_is_refused_outside_local_and_testing(): void
    {
        foreach (['production', 'staging', 'preview', 'prod'] as $env) {
            $this->assertNotNull(JwtSecretGuard::problem($env, JwtSecretGuard::EXAMPLE_PLACEHOLDER), $env);
        }
    }

    public function test_a_short_or_missing_key_is_refused(): void
    {
        foreach ([null, '', str_repeat('k', 31)] as $weak) {
            $this->assertNotNull(JwtSecretGuard::problem('production', $weak), var_export($weak, true));
        }
    }

    public function test_a_long_random_key_is_accepted(): void
    {
        $this->assertNull(JwtSecretGuard::problem('production', base64_encode(random_bytes(36))));
    }

    public function test_local_and_testing_are_never_blocked(): void
    {
        foreach (['local', 'testing'] as $env) {
            $this->assertNull(JwtSecretGuard::problem($env, JwtSecretGuard::EXAMPLE_PLACEHOLDER));
            $this->assertNull(JwtSecretGuard::problem($env, 'short'));
        }
    }

    public function test_the_guard_knows_the_placeholder_actually_shipped_in_env_example(): void
    {
        // Keeps the constant in sync if someone edits .env.example.
        $env = (string) file_get_contents(__DIR__.'/../../.env.example');
        $this->assertSame(1, preg_match('/^SECRET_KEY=(.*)$/m', $env, $m));
        $this->assertSame(JwtSecretGuard::EXAMPLE_PLACEHOLDER, trim($m[1]));
    }
}
