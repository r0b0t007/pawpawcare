<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent in the user's language: the caller sets ->locale($user->preferredLocale()),
 * and Mailable renders envelope() and content() inside that locale.
 */
class PasswordResetCodeMail extends Mailable
{
    public function __construct(public string $code) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: __('Your PawPawCare password reset code'));
    }

    public function content(): Content
    {
        $code = e($this->code);
        // Translations are our own lang/*.json strings (trusted HTML text);
        // only the code is user-adjacent, and it is escaped above.
        $hi = __('Hi,');
        $intro = __('Use this code to reset your PawPawCare password:');
        $expiry = __("The code expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.");
        $signoff = __('— The PawPawCare team');

        return new Content(htmlString: <<<HTML
            <p>{$hi}</p>
            <p>{$intro}</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">{$code}</p>
            <p>{$expiry}</p>
            <p>{$signoff}</p>
            HTML);
    }
}
