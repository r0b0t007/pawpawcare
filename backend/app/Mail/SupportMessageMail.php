<?php

namespace App\Mail;

use App\Models\SupportMessage;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Forwards an in-app support message to the SUPPORT_INBOX address. */
class SupportMessageMail extends Mailable
{
    public function __construct(public SupportMessage $supportMessage) {}

    public function envelope(): Envelope
    {
        $user = $this->supportMessage->user;

        return new Envelope(
            subject: 'Support message from '.($user?->name ?? 'a user'),
            replyTo: $user?->email ? [$user->email] : [],
        );
    }

    public function content(): Content
    {
        $user = $this->supportMessage->user;
        $name = e($user?->name ?? 'Unknown');
        $email = e($user?->email ?? 'unknown');
        $userId = e($this->supportMessage->user_id);
        $body = nl2br(e($this->supportMessage->message));

        return new Content(htmlString: <<<HTML
            <p><strong>From:</strong> {$name} &lt;{$email}&gt; (user {$userId})</p>
            <p><strong>Message:</strong></p>
            <blockquote>{$body}</blockquote>
            HTML);
    }
}
