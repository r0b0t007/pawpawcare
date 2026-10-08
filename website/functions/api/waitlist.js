// Cloudflare Pages Function — replaces Netlify Forms for the waitlist signup.
// Both waitlist forms in website/index.html POST here (same-origin, no JS
// required; script.js only disables the submit button while the browser
// navigates). On success or on a soft failure the visitor still lands on
// /thanks.html — an infra hiccup on our side shouldn't look like a form error
// to a pet owner who just typed their email correctly.
//
//
// Each signup sends two emails through Resend: a notification to WAITLIST_TO,
// and the branded welcome email (../_lib/welcome-email.js) to the visitor.
//
// Required config (see docs/deploy-website-cloudflare.md):
//   RESEND_API_KEY  - secret, from resend.com/api-keys
//   WAITLIST_FROM   - sender, e.g. "PawPawCare <waitlist@pawpawcare.app>"
//                     (must be on a domain verified in Resend); also the
//                     From of the welcome email
//   WAITLIST_TO     - inbox that receives each new signup notification

import {
  CONTACT_EMAIL,
  LIST_UNSUBSCRIBE,
  WELCOME_HTML,
  WELCOME_SUBJECT,
  WELCOME_TEXT,
} from "../_lib/welcome-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  const thanksUrl = `${origin}/thanks.html`;
  const homeUrl = `${origin}/`;

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.redirect(homeUrl, 303);
  }

  // Honeypot: real visitors never see or fill this CSS-hidden field. If it
  // has a value, pretend success so the bot doesn't learn it was caught.
  if (form.get("bot-field")) {
    return Response.redirect(thanksUrl, 303);
  }

  const email = String(form.get("email") || "").trim();
  if (!EMAIL_RE.test(email)) {
    return Response.redirect(`${homeUrl}#waitlist`, 303);
  }

  if (!env.RESEND_API_KEY || !env.WAITLIST_FROM || !env.WAITLIST_TO) {
    console.error("waitlist: missing RESEND_API_KEY / WAITLIST_FROM / WAITLIST_TO");
    return new Response("Signup is temporarily unavailable. Please try again shortly.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Anyone can type any address into the form, so the welcome email is the
  // one thing a stranger could aim at someone else. Its content is fixed (no
  // visitor input is rendered) and Resend honours the idempotency key for
  // 24h, so resubmitting the same address sends it at most once a day.
  const welcomeKey = `waitlist-welcome/${await sha256Hex(email.toLowerCase())}`;

  await Promise.all([
    sendEmail(env, "notification", {
      from: env.WAITLIST_FROM,
      to: env.WAITLIST_TO,
      reply_to: email,
      subject: "New PawPawCare waitlist signup",
      text: `${email} joined the PawPawCare waitlist at ${new Date().toISOString()}.`,
    }),
    sendEmail(
      env,
      "welcome",
      {
        from: env.WAITLIST_FROM,
        to: email,
        reply_to: CONTACT_EMAIL,
        subject: WELCOME_SUBJECT,
        html: WELCOME_HTML,
        text: WELCOME_TEXT,
        headers: { "List-Unsubscribe": LIST_UNSUBSCRIBE },
      },
      welcomeKey,
    ),
  ]);

  return Response.redirect(thanksUrl, 303);
}

export function onRequestGet({ request }) {
  return Response.redirect(new URL(request.url).origin + "/", 302);
}

// Never throws: a failed send is logged and the visitor still lands on
// /thanks.html (see the header comment).
async function sendEmail(env, label, payload, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`waitlist: Resend API error (${label})`, res.status, await res.text());
    }
  } catch (err) {
    console.error(`waitlist: Resend request failed (${label})`, err);
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
