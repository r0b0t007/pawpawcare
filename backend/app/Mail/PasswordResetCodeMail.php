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
        // Translations are escaped too: lang/*.json is plain text, never
        // markup, so a stray '<' or '&' in a future translation shows as
        // text instead of live HTML. ENT_NOQUOTES because every string sits
        // in element text, where quotes are inert; it keeps today's bytes.
        $hi = self::plain(__('Hi,'));
        $intro = self::plain(__('Use this code to reset your PawPawCare password:'));
        $expiry = self::plain(__("The code expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change."));
        $signoff = self::plain(__('— The PawPawCare team'));

        return new Content(htmlString: <<<HTML
            <p>{$hi}</p>
            <p>{$intro}</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">{$code}</p>
            <p>{$expiry}</p>
            <p>{$signoff}</p>
            HTML);
    }

    private static function plain(string $translated): string
    {
        return htmlspecialchars($translated, ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    }
}
