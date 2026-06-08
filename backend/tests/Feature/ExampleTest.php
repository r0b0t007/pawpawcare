<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * The API health check responds (this is an API-only app, no web root).
     */
    public function test_the_health_check_returns_a_successful_response(): void
    {
        $response = $this->getJson('/health');

        $response->assertStatus(200)->assertJson(['status' => 'ok']);
    }
}
