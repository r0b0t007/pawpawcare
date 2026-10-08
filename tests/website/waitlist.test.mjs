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
  WELCOME_HTML,
  WELCOME_SUBJECT,
  WELCOME_TEXT,
} from "../../website/functions/_lib/welcome-email.js";

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
