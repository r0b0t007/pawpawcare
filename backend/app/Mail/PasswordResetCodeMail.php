<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class PasswordResetCodeMail extends Mailable
{
    public function __construct(public string $code) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your PawPawCare password reset code');
    }

    public function content(): Content
    {
        $code = e($this->code);

        return new Content(htmlString: <<<HTML
            <p>Hi,</p>
            <p>Use this code to reset your PawPawCare password:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">{$code}</p>
            <p>The code expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
            <p>— The PawPawCare team</p>
            HTML);
    }
}
