// Tests for the waitlist Pages Function and its welcome email.
// Run: node --test tests/website/   (Node 22+, no dependencies; CI runs it in
// the "Website (waitlist function)" job). Lives outside website/ because
// everything under website/ is published, and website/functions/ is bundled.
//
// fetch is mocked — nothing here talks to Resend.

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { onRequestPost } from "../../website/functions/api/waitlist.js";
import {
  CONTACT_EMAIL,
  LANGUAGES,
  WELCOME_HTML,
  WELCOME_SUBJECT,
  WELCOME_TEXT,
  welcomeEmail,
} from "../../website/functions/_lib/welcome-email.js";
import enCopy from "../../website/functions/_lib/welcome-copy/en.js";
import frCopy from "../../website/functions/_lib/welcome-copy/fr.js";
import esCopy from "../../website/functions/_lib/welcome-copy/es.js";

const env = {
  RESEND_API_KEY: "re_test",
  WAITLIST_FROM: "PawPawCare <hello@pawpawcare.app>",
  WAITLIST_TO: "owner@example.com",
};

let calls;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Calls the handler like Pages does and waits for the background sends.
async function post(fields, { waitUntil } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const pending = [];
  const res = await onRequestPost({
    request: new Request("https://pawpawcare.app/api/waitlist", { method: "POST", body: form }),
    env,
    waitUntil: waitUntil ?? ((p) => pending.push(p)),
  });
  await Promise.all(pending);
  return res;
}

const welcomeCall = () => calls.find((c) => c.body.subject === WELCOME_SUBJECT);
const notificationCall = () => calls.find((c) => c.body.to === env.WAITLIST_TO);

describe("onRequestPost", () => {
  test("valid signup sends the notification and the welcome email", async () => {
    const res = await post({ email: "  Pet.Parent@Example.com " });

    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "https://pawpawcare.app/thanks.html");
    assert.equal(calls.length, 2);

    const notification = notificationCall();
    assert.equal(notification.body.reply_to, "Pet.Parent@Example.com");
    assert.equal(notification.headers["Idempotency-Key"], undefined);

    const welcome = welcomeCall();
    assert.equal(welcome.body.to, "Pet.Parent@Example.com");
    assert.equal(welcome.body.from, env.WAITLIST_FROM);
    assert.equal(welcome.body.reply_to, CONTACT_EMAIL);
    assert.equal(welcome.body.html, WELCOME_HTML);
    assert.equal(welcome.body.text, WELCOME_TEXT);
    assert.match(welcome.body.headers["List-Unsubscribe"], /^<mailto:hello@pawpawcare\.app\?subject=/);
    assert.match(welcome.headers["Idempotency-Key"], /^waitlist-welcome\/[0-9a-f]{12}\/[0-9a-f]{64}$/);
  });

  test("idempotency key: same for an identical resubmit, different when `to` differs in case", async () => {
    await post({ email: "pet.parent@example.com" });
    const first = welcomeCall().headers["Idempotency-Key"];

    calls = [];
    await post({ email: "pet.parent@example.com" });
    assert.equal(welcomeCall().headers["Idempotency-Key"], first);

    // Resend 409s a reused key with a different payload, so a different `to`
    // must never share a key.
    calls = [];
    await post({ email: "Pet.Parent@example.com" });
    assert.notEqual(welcomeCall().headers["Idempotency-Key"], first);
  });

  test("honeypot and invalid addresses send nothing", async () => {
    let res = await post({ email: "a@b.co", "bot-field": "x" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "https://pawpawcare.app/thanks.html");

    res = await post({ email: "not-an-email" });
    assert.equal(res.headers.get("location"), "https://pawpawcare.app/#waitlist");

    assert.equal(calls.length, 0);
  });

  test("redirect does not wait on Resend", async () => {
    globalThis.fetch = () => new Promise(() => {}); // never resolves
    let backgrounded = 0;
    const res = await Promise.race([
      post({ email: "slow@example.com" }, { waitUntil: () => backgrounded++ }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("redirect blocked on Resend")), 1000)),
    ]);
    assert.equal(res.status, 303);
    assert.equal(backgrounded, 1);
  });

  test("a failed send is logged and the other send still goes out", async () => {
    let sent = 0;
    globalThis.fetch = async (url, init) => {
      sent++;
      if (JSON.parse(init.body).html) throw new Error("boom");
      return new Response("{}", { status: 200 });
    };
    const errors = [];
    const realError = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    try {
      const res = await post({ email: "x@y.io" });
      assert.equal(res.status, 303);
    } finally {
      console.error = realError;
    }
    assert.equal(sent, 2);
    assert.ok(errors.some((e) => e.includes("(welcome)")));
  });

  test("missing config returns 500 without sending", async () => {
    const form = new FormData();
    form.set("email", "a@b.co");
    const realError = console.error;
    console.error = () => {};
    try {
      const res = await onRequestPost({
        request: new Request("https://pawpawcare.app/api/waitlist", { method: "POST", body: form }),
        env: { ...env, RESEND_API_KEY: "" },
        waitUntil: () => {},
      });
      assert.equal(res.status, 500);
    } finally {
      console.error = realError;
    }
    assert.equal(calls.length, 0);
  });
});

describe("welcome email content", () => {
  test("no invisible filler characters (suspected Outlook junk signal)", () => {
    for (const [name, body] of [["html", WELCOME_HTML], ["text", WELCOME_TEXT]]) {
      assert.doesNotMatch(body, /&#847;|&zwnj;|&#8204;|͏|​|‌|‍|⁠|﻿/, name);
    }
  });

  test("no camouflaged text: no opacity:0, no tiny fonts, no text coloured like its background", () => {
    assert.doesNotMatch(WELCOME_HTML, /opacity:\s*0(?![.\d])/);
    assert.doesNotMatch(WELCOME_HTML, /font-size:\s*[01]px/);

    const pageBg = WELCOME_HTML.match(/<body style="[^"]*background:(#[0-9a-f]{6})/i)[1].toLowerCase();
    for (const [, style] of WELCOME_HTML.matchAll(/style="([^"]*)"/g)) {
      const color = style.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase();
      if (!color) continue;
      const bg = style.match(/background:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase();
      assert.notEqual(color, bg, `text colour equals its own background: ${style}`);
      if (!bg) assert.notEqual(color, pageBg, `text colour equals the page background: ${style}`);
    }
  });

  test("email-client-safe: no flex/grid, no remote fonts, no unrendered placeholders", () => {
    assert.doesNotMatch(WELCOME_HTML, /display:\s*(flex|grid)/);
    assert.doesNotMatch(WELCOME_HTML, /fonts\.googleapis|fonts\.gstatic|<link\b/);
    assert.doesNotMatch(WELCOME_HTML, /\$\{|undefined/);
    assert.ok(Buffer.byteLength(WELCOME_HTML) < 100_000, "stay under Gmail's ~102 KB clip");
  });

  test("logo is absolute and decorative; preview text doesn't run into the brand name", () => {
    assert.match(WELCOME_HTML, /<img src="https:\/\/pawpawcare\.app\/email\/logo\.png"[^>]* alt=""/);
  });

  test("links and addresses", () => {
    assert.match(WELCOME_HTML, /mailto:hello@pawpawcare\.app\?subject=/);
    assert.doesNotMatch(WELCOME_HTML + WELCOME_TEXT, /#unsubscribe|privacy@pawpawcare/);
    assert.ok(WELCOME_TEXT.includes("utm_source=waitlist_email"));
  });
});

// CHW-196: /fr/ and /es/ forms post a hidden `lang` field.
describe("waitlist language", () => {
  const welcomeTo = (email) => calls.find((c) => c.body.to === email);

  test("a French signup lands on /fr/thanks.html and gets the French email", async () => {
    const res = await post({ email: "chat@example.fr", lang: "fr" });
    assert.equal(res.headers.get("location"), "https://pawpawcare.app/fr/thanks.html");
    const fr = welcomeEmail("fr");
    const sent = welcomeTo("chat@example.fr").body;
    assert.equal(sent.subject, fr.subject);
    assert.equal(sent.html, fr.html);
    assert.equal(sent.text, fr.text);
    assert.match(sent.html, /<html lang="fr"/);
    assert.match(notificationCall().body.text, /\(language: fr\)/);
  });

  test("a Spanish typo goes back to the Spanish form", async () => {
    const res = await post({ email: "not-an-email", lang: "es" });
    assert.equal(res.headers.get("location"), "https://pawpawcare.app/es/#waitlist");
    assert.equal(calls.length, 0);
  });

  test("an unknown or missing language is English", async () => {
    const res = await post({ email: "pet@example.com", lang: "de\"><script>" });
    assert.equal(res.headers.get("location"), "https://pawpawcare.app/thanks.html");
    assert.equal(welcomeTo("pet@example.com").body.subject, WELCOME_SUBJECT);
  });

  test("each language has its own idempotency key for the same address", async () => {
    await post({ email: "pet@example.com", lang: "fr" });
    const fr = welcomeTo("pet@example.com").headers["Idempotency-Key"];
    calls = [];
    await post({ email: "pet@example.com" });
    const en = welcomeTo("pet@example.com").headers["Idempotency-Key"];
    assert.notEqual(fr, en);
  });
});

describe("welcome email in every language", () => {
  const copy = { en: enCopy, fr: frCopy, es: esCopy };

  for (const lang of LANGUAGES) {
    test(`${lang}: same keys as English, translated, nothing left unrendered`, () => {
      const keys = (o) => JSON.stringify(Object.keys(o).sort());
      assert.equal(keys(copy[lang]), keys(enCopy));
      assert.equal(copy[lang].lang, lang);
      assert.equal(copy[lang].steps.length, 3);
      assert.equal(copy[lang].features.length, 3);
      if (lang !== "en") {
        assert.notEqual(copy[lang].subject, enCopy.subject, "not translated yet");
        assert.notEqual(copy[lang].intro, enCopy.intro, "not translated yet");
      }
      const { subject, html, text } = welcomeEmail(lang);
      assert.match(html, new RegExp(`<html lang="${lang}"`));
      for (const s of [subject, html, text]) {
        assert.doesNotMatch(s, /\{(url|email)\}|\$\{|undefined/);
      }
      // Copy is text, not markup: only entities, never tags.
      for (const v of JSON.stringify(copy[lang]).match(/"[^"]*"/g)) assert.doesNotMatch(v, /<[a-z]/i);
      // The invite link points at the home page in the same language.
      const home = lang === "en" ? "https://pawpawcare.app/?" : `https://pawpawcare.app/${lang}/?`;
      assert.ok(text.includes(home), `${lang} signup link`);
    });
  }
});
