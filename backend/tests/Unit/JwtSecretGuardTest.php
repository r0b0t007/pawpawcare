<?php

namespace Tests\Unit;

use App\Support\JwtSecretGuard;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class JwtSecretGuardTest extends TestCase
{
    public function test_production_refuses_the_env_example_placeholder(): void
    {
        $this->expectException(RuntimeException::class);
        JwtSecretGuard::assertSafe(true, JwtSecretGuard::EXAMPLE_PLACEHOLDER);
    }

    public function test_production_refuses_a_short_or_missing_key(): void
    {
        foreach ([null, '', str_repeat('k', 31)] as $weak) {
            try {
                JwtSecretGuard::assertSafe(true, $weak);
                $this->fail('Expected a weak key to be refused: '.var_export($weak, true));
            } catch (RuntimeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_production_accepts_a_long_random_key(): void
    {
        JwtSecretGuard::assertSafe(true, base64_encode(random_bytes(36)));
        $this->addToAssertionCount(1);
    }

    public function test_non_production_is_never_blocked(): void
    {
        JwtSecretGuard::assertSafe(false, JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        JwtSecretGuard::assertSafe(false, 'short');
        $this->addToAssertionCount(1);
    }

    public function test_the_guard_knows_the_placeholder_actually_shipped_in_env_example(): void
    {
        // Keeps the constant in sync if someone edits .env.example.
        $env = (string) file_get_contents(__DIR__.'/../../.env.example');
        $this->assertMatchesRegularExpression('/^SECRET_KEY=(.*)$/m', $env);
        preg_match('/^SECRET_KEY=(.*)$/m', $env, $m);
        $this->assertSame(JwtSecretGuard::EXAMPLE_PLACEHOLDER, trim($m[1]));
    }
}
