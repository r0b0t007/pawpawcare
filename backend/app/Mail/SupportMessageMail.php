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
    private const LABELS = [
        'feedback' => 'Feedback',
        'problem' => 'Problem',
        'idea' => 'Idea',
        'question' => 'Question',
    ];

    public function __construct(public SupportMessage $supportMessage) {}

    private function label(): ?string
    {
        $category = $this->supportMessage->category;

        return $category === null ? null : (self::LABELS[$category] ?? null);
    }

    public function envelope(): Envelope
    {
        $user = $this->supportMessage->user;
        $label = $this->label();
        // Names allow any characters: flatten control characters and runs of
        // whitespace so a name can't reshape the subject line.
        $from = Str::limit(trim(preg_replace('/[\p{C}\s]+/u', ' ', $user?->name ?? '') ?? ''), 60) ?: 'a user';

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
