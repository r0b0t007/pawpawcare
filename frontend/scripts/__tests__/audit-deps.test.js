const fs = require('fs');
const path = require('path');
const { advisories, evaluate } = require('../audit-deps');

const via = (name, severity, ghsa) => ({ source: 1, name, severity, title: `${name} bug`, url: `https://github.com/advisories/${ghsa}`, range: '<9' });

const report = {
  vulnerabilities: {
    braces: { via: [via('braces', 'high', 'GHSA-aaaa-bbbb-cccc')] },
    micromatch: { via: ['braces'] }, // dependents only point at the root
    uuid: { via: [via('uuid', 'moderate', 'GHSA-dddd-eeee-ffff')] },
    forge: { via: [via('node-forge', 'critical', 'GHSA-gggg-hhhh-iiii'), via('node-forge', 'critical', 'GHSA-gggg-hhhh-iiii')] },
  },
};

const allow = (id, review_by = '2099-01-01') => ({ id, package: 'x', reason: 'r', review_by });

describe('audit-deps', () => {
  test('collects each root advisory once, keyed by GHSA id', () => {
    expect(advisories(report).map((a) => [a.id, a.package, a.severity])).toEqual([
      ['GHSA-aaaa-bbbb-cccc', 'braces', 'high'],
      ['GHSA-dddd-eeee-ffff', 'uuid', 'moderate'],
      ['GHSA-gggg-hhhh-iiii', 'node-forge', 'critical'],
    ]);
  });

  test('fails on high/critical advisories not on the allowlist, never on moderate', () => {
    const found = advisories(report);
    expect(evaluate(found, []).failures.map((f) => f.id)).toEqual(['GHSA-aaaa-bbbb-cccc', 'GHSA-gggg-hhhh-iiii']);
    expect(evaluate(found, [allow('GHSA-aaaa-bbbb-cccc'), allow('GHSA-gggg-hhhh-iiii')]).failures).toEqual([]);
  });

  test('warns about stale and overdue allowlist entries without failing', () => {
    const found = advisories(report);
    const { failures, warnings } = evaluate(
      found,
      [allow('GHSA-aaaa-bbbb-cccc', '2026-01-01'), allow('GHSA-gggg-hhhh-iiii'), allow('GHSA-zzzz-zzzz-zzzz')],
      '2026-10-11',
    );
    expect(failures).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining('GHSA-zzzz-zzzz-zzzz (x) no longer applies'),
      expect.stringContaining('GHSA-aaaa-bbbb-cccc (x) was due for review on 2026-01-01'),
    ]);
  });

  test('a failed audit run is an error, not a pass', () => {
    expect(() => advisories({ error: { summary: 'ENOTFOUND registry.npmjs.org' } })).toThrow('ENOTFOUND');
    expect(() => advisories({})).toThrow('no "vulnerabilities"');
  });

  test('every allowlist entry explains itself and has a review date', () => {
    const list = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../audit-allowlist.json'), 'utf8'));
    for (const e of list) {
      expect(e.id).toMatch(/^GHSA(-[a-z0-9]{4}){3}$/);
      expect(e.reason.length).toBeGreaterThan(40);
      expect(e.review_by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
