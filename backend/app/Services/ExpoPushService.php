<?php

namespace App\Services;

use App\Models\DeviceToken;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExpoPushService
{
    private const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

    /**
     * Send a batch of Expo push messages. Each message:
     *   ['to' => ExponentPushToken, 'title' => ..., 'body' => ..., 'data' => [...]].
     * Prunes tokens Expo reports as DeviceNotRegistered.
     *
     * @return array raw Expo responses (for logging/inspection)
     */
    public function send(array $messages): array
    {
        $messages = array_values(array_filter($messages, fn ($m) => ! empty($m['to'])));
        if (empty($messages)) {
            return [];
        }

        $responses = [];

        foreach (array_chunk($messages, 100) as $chunk) {
            try {
                $res = Http::withHeaders([
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])->post(self::ENDPOINT, $chunk);
            } catch (\Throwable $e) {
                Log::warning('Expo push request failed: '.$e->getMessage());
                continue;
            }

            $responses[] = $res->json();

            foreach (($res->json('data') ?? []) as $i => $ticket) {
                if (($ticket['status'] ?? null) === 'error'
                    && ($ticket['details']['error'] ?? null) === 'DeviceNotRegistered') {
                    $token = $chunk[$i]['to'] ?? null;
                    if ($token) {
                        DeviceToken::where('token', $token)->delete();
                    }
                }
            }
        }

        return $responses;
    }
}
