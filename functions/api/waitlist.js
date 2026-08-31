// Cloudflare Pages Function — replaces Netlify Forms for the waitlist signup.
// Both waitlist forms in website/index.html POST here (same-origin, no JS
// required; script.js only disables the submit button while the browser
// navigates). On success or on a soft failure the visitor still lands on
// /thanks.html — an infra hiccup on our side shouldn't look like a form error
// to a pet owner who just typed their email correctly.
//
// Required config (see docs/deploy-website-cloudflare.md):
//   RESEND_API_KEY  - secret, from resend.com/api-keys
//   WAITLIST_FROM   - sender, e.g. "PawPawCare <waitlist@pawpawcare.app>"
//                     (must be on a domain verified in Resend)
//   WAITLIST_TO     - inbox that receives each new signup notification

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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.WAITLIST_FROM,
        to: env.WAITLIST_TO,
        reply_to: email,
        subject: "New PawPawCare waitlist signup",
        text: `${email} joined the PawPawCare waitlist at ${new Date().toISOString()}.`,
      }),
    });

    if (!res.ok) {
      console.error("waitlist: Resend API error", res.status, await res.text());
    }
  } catch (err) {
    console.error("waitlist: Resend request failed", err);
  }

  return Response.redirect(thanksUrl, 303);
}

export function onRequestGet({ request }) {
  return Response.redirect(new URL(request.url).origin + "/", 302);
}
