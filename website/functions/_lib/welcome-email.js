// Welcome email sent to every new waitlist signup (see ../api/waitlist.js).
// Design source: Claude Design project "PawPawCare waitlist welcome email".
//
// This is the email-client-safe build of that design: table layout, inline
// styles, no flexbox/grid, and every image absolute. No web fonts are loaded:
// a remote font request would hand each reader's IP to the font host, which
// the privacy policy doesn't list. The brand fonts are named first in each
// stack so readers who have them installed see them; everyone else gets the
// system fallbacks. Outlook desktop squares the rounded corners — expected.
//
// The content is static on purpose: nothing the visitor typed is rendered, so
// there's no injection surface and every send has an identical payload (which
// is what lets waitlist.js dedupe repeat submissions with an idempotency key).

const SITE = "https://pawpawcare.app";
const LOGO_URL = `${SITE}/email/logo.png`;
const PRIVACY_URL = `${SITE}/privacy/`;
const SIGNUP_URL = `${SITE}/?utm_source=waitlist_email&utm_medium=email&utm_campaign=invite_friend#waitlist`;

// The one address this email asks people to write to — replies, removal
// requests and the List-Unsubscribe header all go here. Must be a real
// mailbox (or forwarder) on the cPanel mail server that MX points at.
export const CONTACT_EMAIL = "hello@pawpawcare.app";

const REMOVE_SUBJECT = "Remove me from the PawPawCare waitlist";
const REMOVE_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(REMOVE_SUBJECT)}`;

const SHARE_MAILTO =
  "mailto:?subject=" +
  encodeURIComponent("Thought you'd like PawPawCare") +
  "&body=" +
  encodeURIComponent(
    "I just joined the waitlist for PawPawCare, an app that keeps all your pet's health in one calm place. " +
      `You can join too: ${SIGNUP_URL}`,
  );

export const WELCOME_SUBJECT = "You're on the list. Thank you!";
// Inbox preview line. Rendered in a plain display:none div — no invisible
// filler characters (&#847;&zwnj; and friends) and no camouflage styling
// (background-coloured text, 1px font, opacity:0). The first Outlook.com
// delivery of the padded, camouflaged version went to Junk (SCL 5) with SPF,
// DKIM and DMARC all passing; hidden-text signals are a suspected cause, new
// domain reputation the other. tests/website/waitlist.test.mjs guards both.
const PREHEADER = "Your invite is on its way. Here's what's coming to PawPawCare.";

export const LIST_UNSUBSCRIBE = `<${REMOVE_MAILTO}>`;

const C = {
  bg: "#fef1e7",
  card: "#ffffff",
  border: "#ecdccb",
  hairline: "#f2e6dc",
  soft: "#fff8f4",
  ink: "#201b15",
  inkSoft: "#514538",
  muted: "#7a6b5c",
  bark: "#653e00",
  caramel: "#855300",
  honey: "#fdb965",
  peach: "#ffddb8",
};
const BODY_FONT = "'Plus Jakarta Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY_FONT = "'Baloo 2','Trebuchet MS',Helvetica,Arial,sans-serif";

const STEPS = [
  { mark: "&#10003;", state: "done", title: "Join the waitlist", text: "Thanks for signing up. You're all set." },
  { mark: "2", state: "next", title: "Get your invite", text: "It arrives with the next preview batch. Keep an eye on your inbox." },
  { mark: "3", state: "later", title: "Add your pets", text: "Set up a profile for each pet in a couple of minutes." },
];

const FEATURES = [
  { title: "Never miss a booster", text: "Due-soon reminders for vaccines and medications, so nothing slips through the cracks." },
  { title: "Every pet, one home", text: "Vet visits, records and weight trends for all your pets, together in one calm place." },
  { title: "Family sharing", text: "Co-own pets with family, and send your vet or sitter a read-only link when they need it." },
];

const DOT_STYLE = {
  done: `background:${C.bark};color:#ffffff;border:2px solid ${C.bark};`,
  next: `background:${C.soft};color:${C.bark};border:2px solid ${C.honey};`,
  later: `background:${C.soft};color:#8a7a6a;border:2px solid ${C.border};`,
};

function eyebrow(label) {
  return `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.caramel};">${label}</p>`;
}

function stepRow({ mark, state, title, text }, isLast) {
  const tag =
    state === "done"
      ? `&nbsp;<span style="font-family:${BODY_FONT};font-size:12px;font-weight:600;color:${C.caramel};background:${C.bg};border-radius:999px;padding:2px 9px;">Done</span>`
      : "";
  return `
              <tr>
                <td width="32" valign="top" style="padding:0 0 ${isLast ? 0 : 18}px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;border-radius:999px;${DOT_STYLE[state]}font-family:${BODY_FONT};font-size:14px;line-height:28px;font-weight:700;">${mark}</td>
                  </tr></table>
                </td>
                <td valign="top" style="padding:3px 0 ${isLast ? 0 : 18}px 14px;">
                  <p style="margin:0;font-family:${BODY_FONT};font-size:15px;line-height:22px;font-weight:700;color:${C.ink};">${title}${tag}</p>
                  <p style="margin:2px 0 0;font-family:${BODY_FONT};font-size:14px;line-height:22px;color:${C.inkSoft};">${text}</p>
                </td>
              </tr>`;
}

function featureRow({ title, text }, index, isLast) {
  return `
              <tr>
                <td width="40" valign="top" style="padding:0 0 ${isLast ? 0 : 16}px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td width="38" height="38" align="center" valign="middle" style="width:38px;height:38px;border-radius:12px;background:${C.bg};border:1px solid ${C.hairline};font-family:${DISPLAY_FONT};font-size:17px;line-height:38px;font-weight:700;color:${C.caramel};">${index + 1}</td>
                  </tr></table>
                </td>
                <td valign="top" style="padding:0 0 ${isLast ? 0 : 16}px 14px;">
                  <p style="margin:0;font-family:${DISPLAY_FONT};font-size:19px;line-height:24px;font-weight:700;color:${C.ink};">${title}</p>
                  <p style="margin:2px 0 0;font-family:${BODY_FONT};font-size:14px;line-height:22px;color:${C.inkSoft};">${text}</p>
                </td>
              </tr>`;
}

export const WELCOME_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${WELCOME_SUBJECT}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>* { font-family: Arial, Helvetica, sans-serif !important; }</style><![endif]-->
<style>
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: separate; border-spacing: 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a { color: ${C.caramel}; }
  @media only screen and (max-width: 620px) {
    .outer { padding: 24px 12px 32px !important; }
    .container { width: 100% !important; }
    .card { padding: 28px 22px 26px !important; border-radius: 20px !important; }
    .h1 { font-size: 30px !important; line-height: 34px !important; }
    .share { padding: 20px !important; }
    .btn-table { width: 100% !important; }
    .btn { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${PREHEADER}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
  <tr>
    <td align="center" class="outer" style="padding:36px 16px 40px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td align="center" style="padding:0 0 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle" style="padding-right:12px;"><img src="${LOGO_URL}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border-radius:14px;"></td>
              <td valign="middle" style="font-family:${DISPLAY_FONT};font-size:26px;line-height:30px;font-weight:700;color:${C.bark};">PawPawCare</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:40px 40px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:0 0 14px;">
                <span style="display:inline-block;background:${C.peach};color:${C.bark};font-family:${BODY_FONT};font-size:13px;line-height:13px;font-weight:700;padding:8px 14px;border-radius:999px;">You're on the list</span>
              </td></tr>
              <tr><td style="padding:0 0 14px;">
                <h1 class="h1" style="margin:0;font-family:${DISPLAY_FONT};font-size:36px;line-height:40px;font-weight:700;color:${C.ink};">Thank you for joining PawPawCare</h1>
              </td></tr>
              <tr><td style="padding:0 0 28px;">
                <p style="margin:0;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${C.inkSoft};">We're putting the finishing touches on the app that keeps all your pet's health in one calm place. You don't need to do anything else: when PawPawCare is ready for you, your invite lands right here in this inbox, for iPhone and Android.</p>
              </td></tr>
              <tr><td style="padding:0 0 28px;">
                ${eyebrow("Where you are")}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${STEPS.map((s, i) => stepRow(s, i === STEPS.length - 1)).join("")}
                </table>
              </td></tr>
              <tr><td style="padding:0 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.hairline};"></td></tr></table></td></tr>
              <tr><td style="padding:0 0 28px;">
                ${eyebrow("What's coming")}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${FEATURES.map((f, i) => featureRow(f, i, i === FEATURES.length - 1)).join("")}
                </table>
              </td></tr>
              <tr><td style="padding:0 0 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td class="share" bgcolor="${C.soft}" style="background:${C.soft};border:1px solid ${C.hairline};border-radius:18px;padding:24px;">
                    <p style="margin:0 0 10px;font-family:${DISPLAY_FONT};font-size:22px;line-height:26px;font-weight:700;color:${C.ink};">Know another pet parent?</p>
                    <p style="margin:0 0 18px;font-family:${BODY_FONT};font-size:15px;line-height:24px;color:${C.inkSoft};">Share PawPawCare with a friend. They can join the waitlist in seconds and get their invite with the next batch, too.</p>
                    <table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td align="center" bgcolor="${C.bark}" style="background:${C.bark};border-radius:999px;">
                        <a class="btn" href="${SHARE_MAILTO}" style="display:inline-block;padding:15px 26px;font-family:${BODY_FONT};font-size:15px;line-height:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Invite a friend</a>
                      </td>
                    </tr></table>
                    <p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${C.inkSoft};">Or send them the link: <a href="${SIGNUP_URL}" style="color:${C.caramel};font-weight:600;">pawpawcare.app</a></p>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td>
                <p style="margin:0 0 6px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${C.inkSoft};">Until then, give someone furry a scratch from us.</p>
                <p style="margin:0;font-family:${DISPLAY_FONT};font-size:18px;line-height:24px;font-weight:700;color:${C.bark};">The PawPawCare team</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 24px 0;">
            <p style="margin:0 0 6px;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${C.muted};">You're receiving this because this address joined the waitlist at pawpawcare.app.<br>Not you, or changed your mind? <a href="${REMOVE_MAILTO}" style="color:${C.caramel};">Ask us to remove you</a> and we'll delete it.</p>
            <p style="margin:0;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${C.muted};"><a href="${PRIVACY_URL}" style="color:${C.caramel};">Privacy policy</a></p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

export const WELCOME_TEXT = `You're on the list. Thank you for joining PawPawCare!

We're putting the finishing touches on the app that keeps all your pet's health in one calm place. You don't need to do anything else: when PawPawCare is ready for you, your invite lands right here in this inbox, for iPhone and Android.

WHERE YOU ARE
${STEPS.map((s, i) => `${i + 1}. ${s.title}${s.state === "done" ? " (done)" : ""}: ${s.text}`).join("\n")}

WHAT'S COMING
${FEATURES.map((f) => `- ${f.title}: ${f.text}`).join("\n")}

KNOW ANOTHER PET PARENT?
Share PawPawCare with a friend. They can join the waitlist in seconds:
${SIGNUP_URL}

Until then, give someone furry a scratch from us.
The PawPawCare team

--
You're receiving this because this address joined the waitlist at pawpawcare.app.
Not you, or changed your mind? Email ${CONTACT_EMAIL} and we'll delete it.
Privacy policy: ${PRIVACY_URL}
`;
