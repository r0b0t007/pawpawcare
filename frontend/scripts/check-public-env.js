#!/usr/bin/env node
// Guards against OTA updates silently changing EXPO_PUBLIC_* values.
//
// EXPO_PUBLIC_* vars are inlined into the JS bundle. Store builds get them from
// the eas.json build profile's `env`; OTA updates get them from the hand-built
// .env.local in the workflow that publishes to that profile's channel. If the
// two drift, the next OTA strips or changes the value on every installed app
// (that is how production ended up with no PostHog key). This script fails CI
// when a profile and its OTA workflow don't set the same EXPO_PUBLIC_* keys,
// or set different literal values.
//
// Run: node scripts/check-public-env.js   (from frontend/; CI runs it)

const fs = require('fs');
const path = require('path');

// eas.json build profile -> workflow that publishes OTA updates to its channel.
const PAIRS = {
  production: '.github/workflows/ota-update.yml',
  preview: '.github/workflows/preview-build.yml',
};

/** EXPO_PUBLIC_* entries from a profile's env block. */
function profileEnv(easJson, profile) {
  const env = easJson.build?.[profile]?.env ?? {};
  return Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('EXPO_PUBLIC_')));
}

/**
 * EXPO_PUBLIC_* entries a workflow writes into .env.local via
 * `echo "KEY=VALUE"` lines. `${{ secrets.X }}` values are kept as-is: they're
 * set, but their value can't be compared.
 */
function workflowEnv(yaml) {
  const out = {};
  for (const m of yaml.matchAll(/echo\s+"(EXPO_PUBLIC_[A-Z0-9_]+)=([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const isSecretRef = (v) => /^\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}$/.test(v);

/** Problems for one profile/workflow pair, as readable strings. */
function compare(profile, buildEnv, otaEnv, workflowName) {
  const problems = [];
  for (const key of Object.keys(buildEnv)) {
    if (!(key in otaEnv)) problems.push(`${key} is in eas.json "${profile}" but not in ${workflowName} (OTA would strip it)`);
  }
  for (const [key, value] of Object.entries(otaEnv)) {
    if (!(key in buildEnv)) {
      problems.push(`${key} is in ${workflowName} but not in eas.json "${profile}" (store builds would lack it)`);
    } else if (!isSecretRef(value) && value !== buildEnv[key]) {
      problems.push(`${key} differs between eas.json "${profile}" and ${workflowName}`);
    } else if (value.trim() === '') {
      problems.push(`${key} is empty in ${workflowName}`);
    }
  }
  return problems;
}

function check(repoRoot) {
  const easJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'frontend/eas.json'), 'utf8'));
  return Object.entries(PAIRS).flatMap(([profile, workflow]) => {
    const yaml = fs.readFileSync(path.join(repoRoot, workflow), 'utf8');
    return compare(profile, profileEnv(easJson, profile), workflowEnv(yaml), path.basename(workflow));
  });
}

module.exports = { profileEnv, workflowEnv, compare, check };

if (require.main === module) {
  const problems = check(path.resolve(__dirname, '../..'));
  if (problems.length) {
    console.error(`EXPO_PUBLIC_* env drift between eas.json and OTA workflows:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('EXPO_PUBLIC_* env: eas.json profiles match their OTA workflows.');
}
