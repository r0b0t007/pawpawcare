// Content-hash versions for the website's same-URL assets.
//
// Pages are revalidated on every load, but /style.css, /script.js and
// /analytics.js keep the same URL across deploys. Without a version, a deploy
// can pair new HTML with an old cached asset. So every page references them
// as /<asset>?v=<first 10 hex chars of the file's SHA-256>, and _headers can
// cache them for a year as immutable.
//
//   node tools/bump-asset-versions.mjs          # check; exits 1 on mismatch
//   node tools/bump-asset-versions.mjs --fix    # rewrite every reference
//
// tests/website/assets.test.mjs runs the same check in CI.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = fileURLToPath(new URL("../website/", import.meta.url));
export const ASSETS = ["style.css", "script.js", "analytics.js"];

// Only functions/ is skipped: it's bundled into the Pages Function, not served.
const SKIP_DIRS = new Set(["functions"]);

// Any href/src whose path ends in one of the assets, in any form (relative,
// absolute URL, single quotes, unquoted, any query), so a malformed reference
// is caught instead of silently ignored.
const REF_RE =
  /\b(href|src)(\s*=\s*)(["']?)([^"'\s>]*?(?<![\w.-])(style\.css|script\.js|analytics\.js)(?:[?#][^"'\s>]*)?)\3/gi;

export function htmlFiles(dir = SITE) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : htmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });
}

// Hash with LF line endings: the deployed file comes from Git, which stores LF
// (.gitattributes eol=lf), even if an editor saved CRLF locally.
export function versionOf(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 10);
}

export function assetVersion(asset) {
  return versionOf(readFileSync(join(SITE, asset), "utf8"));
}

export function expectedRef(asset) {
  return `/${asset}?v=${assetVersion(asset)}`;
}

/** Every asset reference in a page: { asset, value, ok }. */
export function assetRefs(html) {
  return [...html.matchAll(REF_RE)].map((m) => {
    const asset = m[5].toLowerCase();
    return { asset, value: m[4], ok: m[3] === '"' && m[4] === expectedRef(asset) };
  });
}

export function rewrite(html) {
  return html.replace(REF_RE, (_all, attr, eq, _quote, _value, asset) => `${attr}${eq}"${expectedRef(asset.toLowerCase())}"`);
}

/** Problems across the site, as readable strings. */
export function check() {
  const problems = [];
  for (const page of htmlFiles()) {
    const html = readFileSync(page, "utf8");
    const refs = assetRefs(html);
    const name = relative(SITE, page);
    if (!refs.some((r) => r.asset === "style.css")) problems.push(`${name}: no /style.css reference`);
    for (const r of refs) {
      if (!r.ok) problems.push(`${name}: ${r.value} (expected "${expectedRef(r.asset)}")`);
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--fix")) {
    for (const page of htmlFiles()) {
      const html = readFileSync(page, "utf8");
      const next = rewrite(html);
      if (next !== html) {
        writeFileSync(page, next);
        console.log(`updated ${relative(SITE, page)}`);
      }
    }
  }
  const problems = check();
  if (problems.length) {
    console.error(`Asset versions out of date:\n  ${problems.join("\n  ")}\nRun: node tools/bump-asset-versions.mjs --fix`);
    process.exit(1);
  }
  console.log(`asset versions OK: ${ASSETS.map((a) => expectedRef(a)).join("  ")}`);
}
