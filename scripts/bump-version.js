#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/bump-version.js patch   → 1.0.0 → 1.0.1
 *   node scripts/bump-version.js minor   → 1.0.0 → 1.1.0
 *   node scripts/bump-version.js major   → 1.0.0 → 2.0.0
 *   node scripts/bump-version.js 1.2.3   → sets exact version
 */
const fs = require('fs');
const path = require('path');

const appJsonPath  = path.resolve(__dirname, '../app.json');
const pkgJsonPath  = path.resolve(__dirname, '../package.json');

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

const current = appJson.expo.version;
const [major, minor, patch] = current.split('.').map(Number);

const bump = process.argv[2] || 'patch';

let next;
if (/^\d+\.\d+\.\d+$/.test(bump)) {
  next = bump;
} else if (bump === 'major') {
  next = `${major + 1}.0.0`;
} else if (bump === 'minor') {
  next = `${major}.${minor + 1}.0`;
} else {
  next = `${major}.${minor}.${patch + 1}`;
}

// Update app.json
appJson.expo.version = next;
// Increment Android versionCode
if (appJson.expo.android) {
  appJson.expo.android.versionCode = (appJson.expo.android.versionCode || 0) + 1;
}
// Increment iOS buildNumber
if (appJson.expo.ios) {
  appJson.expo.ios.buildNumber = String((parseInt(appJson.expo.ios.buildNumber || '0') + 1));
}

// Update package.json
pkgJson.version = next;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');

console.log(`\n  Version bumped: ${current} → ${next}`);
console.log(`  Android versionCode: ${appJson.expo.android?.versionCode}`);
console.log(`  iOS buildNumber:     ${appJson.expo.ios?.buildNumber}\n`);
console.log('  Next steps:');
console.log(`    git add app.json package.json`);
console.log(`    git commit -m "chore: release v${next}"`);
console.log(`    git tag v${next} && git push && git push --tags\n`);
