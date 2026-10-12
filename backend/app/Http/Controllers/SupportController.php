<?php

namespace App\Http\Controllers;

use App\Mail\SupportMessageMail;
use App\Models\SupportMessage;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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
        ]);

        // The rest is optional triage context. A value we don't recognise is
        // dropped rather than rejected: it must never stop someone reaching us.
        $category = $request->input('category');
        $platform = $request->input('platform');

        $message = new SupportMessage([
            'message' => $data['message'],
            'category' => in_array($category, SupportMessage::CATEGORIES, true) ? $category : null,
            'app_version' => self::cleanVersion($request->input('app_version')),
            'platform' => in_array($platform, ['ios', 'android'], true) ? $platform : null,
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
                    // The class only: mailer messages can quote the address.
                    'error' => class_basename($e),
                ]);
            }
        }

        // The category only — never the message.
        $analytics->capture($request->user(), 'server_support_message_sent', [
            'category' => $message->category ?? 'none',
        ]);

        return response()->json($message->toApi(), 201);
    }

    /** "1.4.0 (37)"-style version: unexpected characters stripped, capped at the column's 32. */
    private static function cleanVersion(mixed $version): ?string
    {
        if (! is_string($version)) {
            return null;
        }

        $clean = trim(mb_substr(preg_replace('/[^0-9A-Za-z.\-+_ ()]/', '', $version) ?? '', 0, 32));

        return $clean === '' ? null : $clean;
    }
}
