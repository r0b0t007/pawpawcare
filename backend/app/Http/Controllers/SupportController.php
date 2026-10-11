<?php

namespace App\Http\Controllers;

use App\Mail\SupportMessageMail;
use App\Models\SupportMessage;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class SupportController extends Controller
{
    /**
     * In-app feedback and support messages (Profile → Send feedback / Help &
     * support). Private: stored here and forwarded to the team's inbox only.
     * Deliberately unrelated to the store rating prompt.
     */
    public function store(Request $request, ProductAnalytics $analytics): JsonResponse
    {
        $data = $request->validate([
            'message' => 'required|string|max:2000',
            'category' => ['nullable', Rule::in(SupportMessage::CATEGORIES)],
            'app_version' => ['nullable', 'string', 'max:32', 'regex:/^[0-9A-Za-z.\-+ ()]+$/D'],
            'platform' => ['nullable', Rule::in(['ios', 'android'])],
        ]);

        $message = new SupportMessage([
            'message' => $data['message'],
            'category' => $data['category'] ?? null,
            'app_version' => $data['app_version'] ?? null,
            'platform' => $data['platform'] ?? null,
        ]);
        $message->user_id = $request->user()->id; // never from input
        $message->save();

        // Best-effort forward to the human inbox. The record above is the
        // source of truth, so a mail hiccup must not fail the request.
        if ($inbox = config('mail.support_inbox')) {
            try {
                Mail::to($inbox)->send(new SupportMessageMail($message));
            } catch (\Throwable $e) {
                Log::error('Support message forward failed', [
                    'support_message_id' => $message->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // The category only — never the message.
        $analytics->capture($request->user(), 'server_support_message_sent', [
            'category' => $message->category ?? 'none',
        ]);

        return response()->json($message->toApi(), 201);
    }
}
