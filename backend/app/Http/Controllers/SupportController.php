<?php

namespace App\Http\Controllers;

use App\Mail\SupportMessageMail;
use App\Models\SupportMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SupportController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        $message = SupportMessage::create([
            'user_id' => $request->user()->id,
            'message' => $data['message'],
        ]);

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

        return response()->json($message->toApi(), 201);
    }
}
