#!/usr/bin/env node
// CI gate on `npm audit` for the app's production dependencies.
//
// A plain `npm audit --audit-level=high` can't gate this repo: Expo's build
// tooling pulls in advisories with no patched release anywhere (and
// `npm audit fix --force` would downgrade Expo and break OTA). So this fails
// on any high/critical advisory that isn't in audit-allowlist.json, where each
// entry says why it can't reach users. Lower severities are only listed.
//
//   node scripts/audit-deps.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST = path.join(ROOT, 'audit-allowlist.json');
const GATED = new Set(['high', 'critical']);

/** One row per advisory from `npm audit --json` (v7+ format). */
function advisories(report) {
  if (report.error) throw new Error(`npm audit failed: ${report.error.summary || JSON.stringify(report.error)}`);
  if (!report.vulnerabilities) throw new Error('npm audit returned no "vulnerabilities" field');
  const byId = new Map();
  for (const vuln of Object.values(report.vulnerabilities)) {
    for (const via of vuln.via) {
      if (typeof via !== 'object') continue; // a dependent of another vulnerable package
      const id = String(via.url || '').match(/GHSA(-[a-z0-9]{4}){3}/i)?.[0] || `npm-${via.source}`;
      byId.set(id, { id, package: via.name, severity: via.severity, title: via.title, range: via.range });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Splits advisories into failures and warnings against the allowlist. */
function evaluate(found, allowlist, today = new Date().toISOString().slice(0, 10)) {
  const allowed = new Map(allowlist.map((entry) => [entry.id, entry]));
  const failures = found.filter((a) => GATED.has(a.severity) && !allowed.has(a.id));
  const foundIds = new Set(found.map((a) => a.id));
  const warnings = [
    ...allowlist.filter((e) => !foundIds.has(e.id)).map((e) => `${e.id} (${e.package}) no longer applies: remove it from audit-allowlist.json`),
    ...allowlist.filter((e) => foundIds.has(e.id) && e.review_by < today).map((e) => `${e.id} (${e.package}) was due for review on ${e.review_by}: check for a fix and update audit-allowlist.json`),
  ];
  return { failures, warnings };
}

function runAudit() {
  try {
    return execSync('npm audit --omit=dev --package-lock-only --json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (err.stdout) return err.stdout; // npm audit exits 1 whenever it finds anything
    throw err;
  }
}

function main() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  const found = advisories(JSON.parse(runAudit()));
  const { failures, warnings } = evaluate(found, allowlist);
  const allowedIds = new Set(allowlist.map((e) => e.id));

  const rows = found.map((a) => {
    const status = !GATED.has(a.severity) ? 'reported' : allowedIds.has(a.id) ? 'allowlisted' : '**FAIL**';
    return `| ${a.severity} | ${a.package} | [${a.id}](https://github.com/advisories/${a.id}) | ${a.title} | ${status} |`;
  });
  const summary = [
    '### npm audit (production dependencies)',
    found.length ? '| Severity | Package | Advisory | Title | Status |\n|---|---|---|---|---|\n' + rows.join('\n') : 'No advisories.',
    '',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');

  for (const w of warnings) console.log(`::warning::${w}`);
  for (const f of failures) console.log(`::error::${f.severity} advisory ${f.id} in ${f.package}: ${f.title}`);
  if (failures.length) {
    console.error(`\n${failures.length} high/critical advisory(ies) not in audit-allowlist.json. Update the dependency, or allowlist it with the reason it can't reach users.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { advisories, evaluate };
