<?php

namespace App\Providers;

use App\Services\Extraction\AnthropicDriver;
use App\Services\Extraction\ExtractionClient;
use App\Services\Extraction\OpenAiCompatibleDriver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // AI document intake: which vision LLM reads vault documents.
        // `anthropic` (default) or `openai-compatible` (Qwen, Kimi, OpenRouter…).
        $this->app->bind(ExtractionClient::class, fn () => match (config('services.extraction.provider')) {
            'openai-compatible' => new OpenAiCompatibleDriver,
            default => new AnthropicDriver,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
