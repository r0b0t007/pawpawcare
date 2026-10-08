// Guards the cache-busting versions on /style.css, /script.js and
// /analytics.js across every page. Run: node --test "tests/website/*.test.mjs"
// (CI: "Website tests"). To fix a failure: node tools/bump-asset-versions.mjs --fix
//
// Pages are revalidated on every load while these assets keep the same URL, so
// a change shipped without a new URL pairs new HTML with an old cached asset
// for returning visitors. See tools/bump-asset-versions.mjs.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ASSETS, assetRefs, check, expectedRef, htmlFiles, rewrite, versionOf } from "../../tools/bump-asset-versions.mjs";

test("every page references the assets at their current content-hash version", () => {
  assert.ok(htmlFiles().length >= 5, "expected the site's pages");
  const problems = check();
  assert.deepEqual(problems, [], `Run: node tools/bump-asset-versions.mjs --fix\n  ${problems.join("\n  ")}`);
});

test("malformed or stale references are detected, not skipped", () => {
  const v = expectedRef("style.css");
  const bad = [
    '<link rel="stylesheet" href="style.css">',
    "<link rel='stylesheet' href='/style.css'>",
    '<link rel="stylesheet" href="https://pawpawcare.app/style.css">',
    `<link rel="stylesheet" href="${v.replace(/v=([0-9a-f]+)/, (_, h) => "v=" + h.toUpperCase())}">`,
    `<link rel="stylesheet" href="${v}&x=1">`,
    '<link rel="stylesheet" href="/style.css?v=0000000000">',
    "<script src=/script.js defer></script>",
    '<script src="/analytics.js" defer></script>',
  ];
  for (const html of bad) {
    const refs = assetRefs(html);
    assert.equal(refs.length, 1, `not detected: ${html}`);
    assert.equal(refs[0].ok, false, `wrongly accepted: ${html}`);
  }
  // Lookalike names are not assets.
  assert.equal(assetRefs('<script src="/transcript.js"></script>').length, 0);
});

test("--fix rewrites every form to the canonical versioned URL", () => {
  const html =
    "<link href='style.css?v=1'><script src=/script.js defer></script>" +
    '<script src="https://pawpawcare.app/analytics.js"></script>';
  const fixed = rewrite(html);
  for (const asset of ASSETS) assert.ok(fixed.includes(`"${expectedRef(asset)}"`), `${asset} not rewritten: ${fixed}`);
  assert.ok(assetRefs(fixed).every((r) => r.ok));
});

test("version ignores CRLF vs LF (Git stores LF; editors on Windows may not)", () => {
  assert.equal(versionOf("a {\r\n  color: red;\r\n}\r\n"), versionOf("a {\n  color: red;\n}\n"));
  assert.notEqual(versionOf("a{color:red}"), versionOf("a{color:blue}"));
});
