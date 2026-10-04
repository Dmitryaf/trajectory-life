import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateAudit } from './dependency-audit-policy.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const original = {
  full: {
    auditReportVersion: 2,
    vulnerabilities: load('./dependency-audit-exception.json').findings,
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } },
  },
  production: {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  },
  exception: load('./dependency-audit-exception.json'),
  now: '2026-10-04T12:00:00Z',
};
original.context = {
  files: { ...original.exception.files },
  lintCommand: original.exception.lintCommand,
  allAffectedNodesDevOnly: true,
};
const scenario = () => structuredClone(original);
const recount = (report) => {
  report.metadata.vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const entry of Object.values(report.vulnerabilities)) {
    report.metadata.vulnerabilities[entry.severity]++;
    report.metadata.vulnerabilities.total++;
  }
};

test('the captured reviewed dev-only report uses an explicit exception', () => {
  assert.equal(evaluateAudit(scenario()).status, 'passed-with-exception');
});
test('a clean report passes without an exception even after expiry', () => {
  const input = scenario();
  input.full = structuredClone(input.production);
  input.now = '2026-11-01T00:00:00Z';
  assert.deepEqual(evaluateAudit(input), { status: 'passed', exceptionUsed: false });
});
test('expiry is enforced at the exact boundary', () => {
  const input = scenario();
  input.now = new Date(Date.parse(input.exception.expiresAt) - 1);
  assert.equal(evaluateAudit(input).exceptionUsed, true);
  input.now = input.exception.expiresAt;
  assert.throws(() => evaluateAudit(input), /expired/);
});
for (const [label, alter, expected] of [
  [
    'another high finding',
    (x) => {
      x.full.vulnerabilities.other = { ...structuredClone(x.full.vulnerabilities.braces), name: 'other' };
      recount(x.full);
    },
    /differ/,
  ],
  [
    'another advisory in a known package',
    (x) => {
      x.full.vulnerabilities.braces.via.push({ source: 999, name: 'braces', severity: 'high', url: 'https://example.invalid/advisory' });
    },
    /differ/,
  ],
  [
    'severity escalation to critical',
    (x) => {
      x.full.vulnerabilities.braces.severity = 'critical';
      recount(x.full);
    },
    /differ/,
  ],
  [
    'known advisory also in production',
    (x) => {
      x.production = structuredClone(x.full);
    },
    /Production/,
  ],
  [
    'affected lockfile node no longer dev-only',
    (x) => {
      x.context.allAffectedNodesDevOnly = false;
    },
    /scope/,
  ],
  [
    'changed lockfile',
    (x) => {
      x.context.files['package-lock.json'] = 'changed';
    },
    /versions/,
  ],
  [
    'changed Stylelint configuration',
    (x) => {
      x.context.files['stylelint.config.js'] = 'changed';
    },
    /entry points/,
  ],
  [
    'changed Vue style lint entry point',
    (x) => {
      x.context.files['scripts/check-style-boundaries.mjs'] = 'changed';
    },
    /entry points/,
  ],
  [
    'changed CLI glob',
    (x) => {
      x.context.lintCommand = 'stylelint "$UNTRUSTED_GLOB"';
    },
    /entry points/,
  ],
  [
    'unknown nested package path',
    (x) => {
      x.full.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces');
    },
    /differ/,
  ],
  [
    'network error report',
    (x) => {
      x.full = { error: { code: 'ENETUNREACH' } };
    },
    /report/,
  ],
  [
    'missing production report',
    (x) => {
      x.production = undefined;
    },
    /report/,
  ],
  [
    'unsupported report schema',
    (x) => {
      x.full.auditReportVersion = 3;
    },
    /report/,
  ],
  [
    'false zero metadata',
    (x) => {
      x.full.metadata.vulnerabilities.high = 0;
    },
    /counts/,
  ],
  [
    'missing findings despite positive metadata',
    (x) => {
      x.full.vulnerabilities = {};
    },
    /counts/,
  ],
  [
    'invalid expiry',
    (x) => {
      x.exception.expiresAt = 'invalid';
    },
    /invalid date/,
  ],
  [
    'invalid clock',
    (x) => {
      x.now = 'invalid';
    },
    /invalid date/,
  ],
]) {
  test(`blocks ${label}`, () => {
    const input = scenario();
    alter(input);
    assert.throws(() => evaluateAudit(input), expected);
  });
}
test('lower severities retain the existing audit threshold', () => {
  const input = scenario();
  input.full.vulnerabilities.other = { name: 'other', severity: 'moderate', nodes: ['node_modules/other'], via: ['other-source'] };
  recount(input.full);
  assert.equal(evaluateAudit(input).exceptionUsed, true);
});
