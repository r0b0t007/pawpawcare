#!/usr/bin/env node
// Prints the EXPO_PUBLIC_* entries of an eas.json build profile as .env lines.
//
// EXPO_PUBLIC_* vars are inlined into the JS bundle. Store builds read them
// from the eas.json profile's `env`; OTA updates are published from CI, which
// generates .env.local with this script so both come from the same source —
// hand-copied values drifted before (production shipped without a PostHog
// key), and an empty or missing value would be inlined into every installed
// app on the next update. Fails loudly instead.
//
//   node scripts/eas-env.js production > .env.local

const fs = require('fs');
const path = require('path');

const EAS_JSON = path.resolve(__dirname, '../eas.json');

/** EXPO_PUBLIC_* entries of a profile; throws on a missing profile or empty value. */
function publicEnv(easJson, profile) {
  const build = easJson.build?.[profile];
  if (!build) throw new Error(`eas.json has no build profile "${profile}"`);
  const entries = Object.entries(build.env ?? {}).filter(([key]) => key.startsWith('EXPO_PUBLIC_'));
  if (entries.length === 0) throw new Error(`eas.json profile "${profile}" sets no EXPO_PUBLIC_* vars`);
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`eas.json profile "${profile}" has an empty ${key}`);
    }
    if (/[\r\n]/.test(value)) throw new Error(`eas.json profile "${profile}" ${key} contains a newline`);
  }
  return Object.fromEntries(entries);
}

function toDotenv(env) {
  return `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;
}

module.exports = { publicEnv, toDotenv };

if (require.main === module) {
  const profile = process.argv[2];
  if (!profile) {
    console.error('usage: node scripts/eas-env.js <profile>');
    process.exit(2);
  }
  try {
    const easJson = JSON.parse(fs.readFileSync(EAS_JSON, 'utf8'));
    process.stdout.write(toDotenv(publicEnv(easJson, profile)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
