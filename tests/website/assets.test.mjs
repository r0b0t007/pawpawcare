// Guards the stylesheet cache-busting version on every page.
// Run: node --test "tests/website/*.test.mjs"  (CI: "Website (waitlist function)").
//
// Cloudflare serves /style.css with a multi-hour browser cache while pages
// themselves are revalidated on every load, so a CSS change shipped without a
// new URL pairs new HTML with old CSS for returning visitors (the hero
// redesign in #80 shipped with that exposure). Each page links /style.css?v=<first 10 hex chars of
// the file's SHA-256>; this test fails if any page's version doesn't match.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../../website/", import.meta.url));
const SKIP_DIRS = new Set(["functions", "_worker.js", "images", "fonts", "email"]);

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : htmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });
}

const expected = createHash("sha256").update(readFileSync(join(SITE, "style.css"))).digest("hex").slice(0, 10);

test("every page links /style.css with the current content-hash version", () => {
  const pages = htmlFiles(SITE);
  assert.ok(pages.length >= 5, `expected the site's pages, found ${pages.length}`);

  const problems = [];
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const refs = [...html.matchAll(/href="\/style\.css(\?v=([0-9a-f]+))?"/g)];
    for (const [, , version] of refs) {
      if (version !== expected) problems.push(`${relative(SITE, page)}: v=${version ?? "(none)"}`);
    }
  }

  assert.deepEqual(
    problems,
    [],
    `style.css changed: set href="/style.css?v=${expected}" in:\n  ${problems.join("\n  ")}`,
  );
});
