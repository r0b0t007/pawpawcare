// Guards the /fr/ and /es/ copies of the marketing site (CHW-196).
// Run: node --test "tests/website/*.test.mjs" (CI: "Website tests").
//
// Translated: the home page, the vaccine schedule and the thanks page.
// The privacy policy and terms stay English-only until their professional
// translation is signed off, so every language links /privacy/ and /terms/.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../../website/", import.meta.url));
const SITE = "https://pawpawcare.app";
const LANGS = ["en", "fr", "es"];
const OG_LOCALE = { en: "en_US", fr: "fr_FR", es: "es_ES" };

// Indexable pages get hreflang alternates; thanks.html is noindex.
const PAGES = [
  { file: "index.html", path: "/", indexed: true },
  { file: "vaccine-schedule/index.html", path: "/vaccine-schedule/", indexed: true },
  { file: "thanks.html", path: "/thanks.html", indexed: false },
];

const prefix = (lang) => (lang === "en" ? "" : `/${lang}`);
const read = (lang, file) => readFileSync(`${WEB}${lang === "en" ? "" : `${lang}/`}${file}`, "utf8");
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

// Links that stay the same in every language: English-only pages, the form
// endpoint and static files.
const SHARED = /^\/(privacy\/|terms\/|api\/|fonts\/|images\/|email\/|style\.css|script\.js|analytics\.js|logo-mark\.png|favicon|apple-touch-icon\.png|og-image)/;

for (const { file, path, indexed } of PAGES) {
  for (const lang of LANGS) {
    test(`${lang}${path}: language, canonical, alternates, links, forms`, () => {
      const html = read(lang, file);
      assert.match(html, new RegExp(`<html lang="${lang}"`));

      if (indexed) {
        const self = `${SITE}${prefix(lang)}${path}`;
        assert.ok(html.includes(`<link rel="canonical" href="${self}">`), `canonical ${self}`);
        const alternates = all(html, /<link rel="alternate" hreflang="([^"]+)" href="[^"]+">/g);
        assert.deepEqual(alternates, ["en", "fr", "es", "x-default"]);
        for (const l of LANGS) {
          assert.ok(html.includes(`<link rel="alternate" hreflang="${l}" href="${SITE}${prefix(l)}${path}">`), `hreflang ${l}`);
        }
        assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}${path}">`));
        assert.ok(html.includes(`<meta property="og:locale" content="${OG_LOCALE[lang]}">`));
        assert.ok(html.includes(`<meta property="og:url" content="${self}">`), "og:url");
        // Switcher in header and footer, the current language marked.
        const current = all(html, /<a href="([^"]+)" lang="[a-z]+" hreflang="[a-z]+" aria-current="true">/g);
        assert.deepEqual(current, [`${prefix(lang)}${path}`, `${prefix(lang)}${path}`]);
      } else {
        assert.match(html, /<meta name="robots" content="noindex">/);
      }

      // Every internal link stays in the page's language, apart from the
      // shared ones above.
      // (The language switchers link the other languages on purpose.)
      const body = html.replace(/<nav class="lang-switch[^"]*"[\s\S]*?<\/nav>/g, "");
      for (const href of all(body, /\shref="(\/[^"]*)"/g)) {
        if (SHARED.test(href)) continue;
        if (lang === "en") {
          assert.doesNotMatch(href, /^\/(fr|es)\//, `${href} on an English page`);
        } else {
          assert.ok(href.startsWith(`/${lang}/`), `${href} should stay in /${lang}/`);
        }
      }

      // Waitlist forms post the page's language (English posts none).
      for (const form of html.match(/<form[\s\S]*?<\/form>/g) || []) {
        assert.match(form, /action="\/api\/waitlist"/);
        const hidden = form.match(/<input type="hidden" name="lang" value="([a-z]+)">/);
        assert.equal(hidden ? hidden[1] : "en", lang);
      }
    });
  }
}

test("translated pages leave no English chrome behind", () => {
  // Distinctive English strings of the shared header, footer and forms.
  const english = ["Get early access", "How it works", "Made for the people pets rely on", "Cookie settings", "Skip to content", "Get the free preview", "You're on the list"];
  for (const lang of ["fr", "es"]) {
    for (const { file } of PAGES) {
      const html = read(lang, file);
      for (const s of english) assert.ok(!html.includes(s), `${lang}/${file} still says "${s}"`);
    }
  }
});

test("the sitemap lists every indexable page in every language", () => {
  const sitemap = readFileSync(`${WEB}sitemap.xml`, "utf8");
  for (const { path, indexed } of PAGES) {
    if (!indexed) continue;
    for (const lang of LANGS) {
      assert.ok(sitemap.includes(`<loc>${SITE}${prefix(lang)}${path}</loc>`), `${prefix(lang)}${path}`);
    }
  }
});
