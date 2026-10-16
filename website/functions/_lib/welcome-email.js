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
//
// One template, one copy file per language (./welcome-copy/{en,fr,es}.js),
// chosen by the language of the page the visitor signed up on.

import en from "./welcome-copy/en.js";
import fr from "./welcome-copy/fr.js";
import es from "./welcome-copy/es.js";

const SITE = "https://pawpawcare.app";
const LOGO_URL = `${SITE}/email/logo.png`;
// The privacy policy is English-only until its professional translation is
// signed off (CHW-196), so every language links the English page.
const PRIVACY_URL = `${SITE}/privacy/`;

export const LANGUAGES = ["en", "fr", "es"];
const COPY = { en, fr, es };

// The one address this email asks people to write to — replies, removal
// requests and the List-Unsubscribe header all go here. Must be a real
// mailbox (or forwarder) on the cPanel mail server that MX points at.
export const CONTACT_EMAIL = "hello@pawpawcare.app";

// The List-Unsubscribe header is read by mail clients, not people: one fixed
// English subject for every language.
export const LIST_UNSUBSCRIBE = `<mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(en.removeSubject)}>`;

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

// Marks and states of the three steps; their words come from the copy.
const STEP_MARKS = [
  { mark: "&#10003;", state: "done" },
  { mark: "2", state: "next" },
  { mark: "3", state: "later" },
];

const DOT_STYLE = {
  done: `background:${C.bark};color:#ffffff;border:2px solid ${C.bark};`,
  next: `background:${C.soft};color:${C.bark};border:2px solid ${C.honey};`,
  later: `background:${C.soft};color:#8a7a6a;border:2px solid ${C.border};`,
};

function eyebrow(label) {
  return `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.caramel};">${label}</p>`;
}

function stepRow({ mark, state, title, text }, doneTag, isLast) {
  const tag =
    state === "done"
      ? `&nbsp;<span style="font-family:${BODY_FONT};font-size:12px;font-weight:600;color:${C.caramel};background:${C.bg};border-radius:999px;padding:2px 9px;">${doneTag}</span>`
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

// The signup link in the email points at the home page in the same language.
const signupUrl = (lang) =>
  `${SITE}/${lang === "en" ? "" : `${lang}/`}?utm_source=waitlist_email&utm_medium=email&utm_campaign=invite_friend#waitlist`;

function render(t) {
  const SIGNUP_URL = signupUrl(t.lang);
  const REMOVE_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t.removeSubject)}`;
  const SHARE_MAILTO =
    "mailto:?subject=" +
    encodeURIComponent(t.shareMailSubject) +
    "&body=" +
    encodeURIComponent(t.shareMailBody.replace("{url}", SIGNUP_URL));
  const steps = STEP_MARKS.map((s, i) => ({ ...s, ...t.steps[i] }));

  const html = `<!DOCTYPE html>
<html lang="${t.lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${t.subject}</title>
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
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${t.preheader}</div>
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
                <span style="display:inline-block;background:${C.peach};color:${C.bark};font-family:${BODY_FONT};font-size:13px;line-height:13px;font-weight:700;padding:8px 14px;border-radius:999px;">${t.badge}</span>
              </td></tr>
              <tr><td style="padding:0 0 14px;">
                <h1 class="h1" style="margin:0;font-family:${DISPLAY_FONT};font-size:36px;line-height:40px;font-weight:700;color:${C.ink};">${t.title}</h1>
              </td></tr>
              <tr><td style="padding:0 0 28px;">
                <p style="margin:0;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${C.inkSoft};">${t.intro}</p>
              </td></tr>
              <tr><td style="padding:0 0 28px;">
                ${eyebrow(t.whereYouAre)}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps.map((s, i) => stepRow(s, t.doneTag, i === steps.length - 1)).join("")}
                </table>
              </td></tr>
              <tr><td style="padding:0 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.hairline};"></td></tr></table></td></tr>
              <tr><td style="padding:0 0 28px;">
                ${eyebrow(t.whatsComing)}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${t.features.map((f, i) => featureRow(f, i, i === t.features.length - 1)).join("")}
                </table>
              </td></tr>
              <tr><td style="padding:0 0 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td class="share" bgcolor="${C.soft}" style="background:${C.soft};border:1px solid ${C.hairline};border-radius:18px;padding:24px;">
                    <p style="margin:0 0 10px;font-family:${DISPLAY_FONT};font-size:22px;line-height:26px;font-weight:700;color:${C.ink};">${t.shareTitle}</p>
                    <p style="margin:0 0 18px;font-family:${BODY_FONT};font-size:15px;line-height:24px;color:${C.inkSoft};">${t.shareText}</p>
                    <table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td align="center" bgcolor="${C.bark}" style="background:${C.bark};border-radius:999px;">
                        <a class="btn" href="${SHARE_MAILTO}" style="display:inline-block;padding:15px 26px;font-family:${BODY_FONT};font-size:15px;line-height:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${t.shareButton}</a>
                      </td>
                    </tr></table>
                    <p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${C.inkSoft};">${t.shareLinkLead} <a href="${SIGNUP_URL}" style="color:${C.caramel};font-weight:600;">pawpawcare.app</a></p>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td>
                <p style="margin:0 0 6px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${C.inkSoft};">${t.signoff}</p>
                <p style="margin:0;font-family:${DISPLAY_FONT};font-size:18px;line-height:24px;font-weight:700;color:${C.bark};">${t.team}</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 24px 0;">
            <p style="margin:0 0 6px;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${C.muted};">${t.footerWhy}<br>${t.footerNotYou} <a href="${REMOVE_MAILTO}" style="color:${C.caramel};">${t.footerRemoveLink}</a> ${t.footerRemoveTail}</p>
            <p style="margin:0;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${C.muted};"><a href="${PRIVACY_URL}" style="color:${C.caramel};">${t.privacy}</a></p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain text never shows entities: decode the few the copy uses.
  const plain = (s) => s.replace(/&nbsp;/g, " ").replace(/&#8239;/g, " ");
  const text = plain(`${t.textTitle}

${t.intro}

${t.whereYouAre.toUpperCase()}
${steps.map((s, i) => `${i + 1}. ${s.title}${s.state === "done" ? ` ${t.textDone}` : ""}: ${s.text}`).join("\n")}

${t.whatsComing.toUpperCase()}
${t.features.map((f) => `- ${f.title}: ${f.text}`).join("\n")}

${t.shareTitle.toUpperCase()}
${t.textShare}
${SIGNUP_URL}

${t.signoff}
${t.team}

--
${t.footerWhy}
${t.textNotYou.replace("{email}", CONTACT_EMAIL)}
${t.privacy}: ${PRIVACY_URL}
`);

  return { subject: plain(t.subject), html, text };
}

const RENDERED = Object.fromEntries(LANGUAGES.map((lang) => [lang, render(COPY[lang])]));

/** The welcome email in `lang` ('en' | 'fr' | 'es'); English for anything else. */
export const welcomeEmail = (lang) => RENDERED[LANGUAGES.includes(lang) ? lang : "en"];

// The English email, under the names the tests and older callers use.
export const WELCOME_SUBJECT = RENDERED.en.subject;
export const WELCOME_HTML = RENDERED.en.html;
export const WELCOME_TEXT = RENDERED.en.text;
