<?php

namespace App\Mail;

use App\Models\SupportMessage;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Support\Str;

/** Forwards an in-app feedback or support message to the SUPPORT_INBOX address. */
class SupportMessageMail extends Mailable
{
    public function __construct(public SupportMessage $supportMessage) {}

    private function label(): ?string
    {
        return SupportMessage::categoryLabel($this->supportMessage->category);
    }

    public function envelope(): Envelope
    {
        $user = $this->supportMessage->user;
        $label = $this->label();
        // Names allow any characters. The mailer already encodes headers, so
        // this is about a readable subject: collapse control characters,
        // separators and bidi overrides (which could reorder "[Problem] from")
        // into single spaces, but keep the zero-width joiners that emoji
        // sequences and Indic/Persian names need.
        $from = Str::limit(trim(preg_replace('/[\p{Cc}\p{Z}\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]+/u', ' ', $user?->name ?? '') ?? ''), 60) ?: 'a user';

        return new Envelope(
            subject: $label ? "[{$label}] from {$from}" : "Support message from {$from}",
            replyTo: $user?->email ? [$user->email] : [],
        );
    }

    public function content(): Content
    {
        $user = $this->supportMessage->user;
        $name = e($user?->name ?? 'Unknown');
        $email = e($user?->email ?? 'unknown');
        $userId = e($this->supportMessage->user_id);
        $category = e($this->label() ?? 'Not given');
        $app = e(($this->supportMessage->app_version ?? 'unknown version').' on '.($this->supportMessage->platform ?? 'unknown platform'));
        $body = nl2br(e($this->supportMessage->message));

        return new Content(htmlString: <<<HTML
            <p><strong>From:</strong> {$name} &lt;{$email}&gt; (user {$userId})</p>
            <p><strong>Type:</strong> {$category}<br><strong>App:</strong> {$app}</p>
            <p><strong>Message:</strong></p>
            <blockquote>{$body}</blockquote>
            HTML);
    }
}
