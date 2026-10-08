import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { digest } from './cutover-policy.mjs';
import {
  assertAbsent,
  assertBackend,
  assertCreated,
  assertDispatch,
  assertEffectiveAddition,
  assertPriorProof,
  assertSingleAddition,
  flagEvidence,
  flagKey,
  signupKey,
  inventoryHash,
  operate,
  pins,
} from './telemetry-owner-baseline.mjs';

const key = 'sb_publishable_synthetic_owner';
const sha = 'a'.repeat(40);
const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: `refs/heads/${pins.branch}`,
  GITHUB_SHA: sha,
  GITHUB_REPOSITORY: pins.repository,
  VERCEL_PROJECT_ID: pins.projectId,
  VERCEL_ORG_ID: pins.teamId,
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
};
const inputs = {
  mode: 'inspect',
  operator_mode: 'inspect',
  sha: pins.sha,
  tree: pins.tree,
  ci_run: pins.ciRun,
  previous_id: pins.candidateId,
};
function fixture() {
  const rows = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'].map((name) => ({
    id: name,
    key: name,
    type: 'plain',
    target: ['production'],
    value: name.endsWith('_URL') ? 'https://api.trajectory-life.ru' : key,
    updatedAt: 1,
  }));
  rows.push({ id: 'existing-signup', key: signupKey, type: 'plain', target: ['production'], value: 'false', updatedAt: 3 });
  rows.push({ id: 'unrelated', key: 'PRIVATE_CONFIG', type: 'sensitive', target: ['production'], value: '[SENSITIVE]', updatedAt: 2 });
  const environment = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  Object.assign(environment, { VITE_REQUIRE_AUTH: 'true', VITE_ENABLE_SIGNUP: 'false' });
  const deployment = {
    id: pins.candidateId,
    projectId: pins.projectId,
    url: 'fixture.vercel.app',
    readyState: 'READY',
    meta: { sourceSha: pins.sha, ciRun: pins.ciRun, backendUrl: 'https://api.trajectory-life.ru', publicKeySha256: digest(key) },
  };
  return { rows, readableRows: rows, flagRows: [], environment, canonical: deployment, custom: structuredClone(deployment) };
}
function flag(selectedKey = flagKey) {
  return { id: 'new-flag', key: selectedKey, value: 'false', type: 'plain', target: ['production'], updatedAt: 10 };
}
function actions(before = fixture(), selectedKey = flagKey) {
  const calls = { post: 0, source: 0, saved: [] };
  let snapshotCount = 0;
  return {
    calls,
    save: async (record) => calls.saved.push(structuredClone(record)),
    now: Date.now,
    assertCurrent: async () => {
      calls.source++;
    },
    assertPrior: async () => {},
    snapshot: async () => {
      snapshotCount++;
      const result = structuredClone(before);
      if (snapshotCount > 2) {
        result.rows.push(flag(selectedKey));
        if (selectedKey === flagKey) {
          result.flagRows.push(flag(selectedKey));
        } else {
          result.signupRows = [flag(selectedKey)];
        }
        result.readableRows = result.rows;
        result.environment[selectedKey] = 'false';
      }
      return result;
    },
    create: async (body) => {
      calls.post++;
      assert.deepEqual(body, { key: selectedKey, value: 'false', type: 'plain', target: ['production'] });
      return { created: flag(selectedKey), failed: [] };
    },
  };
}

test('default CLI has zero file/token/network I/O in an empty directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owner-offline-'));
  const result = JSON.parse(
    execFileSync(process.execPath, [resolve('scripts/ci/telemetry-owner-baseline.mjs')], {
      cwd: dir,
      env: { ...process.env, GITHUB_EVENT_PATH: '/must-not-read', VERCEL_TOKEN: 'must-not-use' },
      encoding: 'utf8',
    }),
  );
  assert.equal(result.liveCalls, 0);
  assert.equal(result.status, 'offline-plan');
  assert.deepEqual(readdirSync(dir), []);
});

test('dispatch binds actual temporary checkout, exact main/tree/CI and project/team', () => {
  assert.equal(assertDispatch({ inputs }, env, sha, pins.branch).operator_mode, 'inspect');
  for (const change of [{ mode: 'bootstrap-false' }, { mode: 'enable' }, { operator_mode: 'enable' }, { operator_mode: undefined }]) {
    assert.throws(() => assertDispatch({ inputs: { ...inputs, ...change } }, env, sha, pins.branch));
  }
  const bootstrap = { ...inputs, operator_mode: 'bootstrap-false', absence_inspection_run: '122', absence_receipt_sha256: 'c'.repeat(64) };
  assert.equal(assertDispatch({ inputs: bootstrap }, env, sha, pins.branch).operator_mode, 'bootstrap-false');
  for (const changed of [
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_SHA: 'b'.repeat(40) },
    { VERCEL_PROJECT_ID: 'foreign' },
    { GITHUB_REPOSITORY: 'foreign/repo' },
  ]) {
    assert.throws(() => assertDispatch({ inputs }, { ...env, ...changed }, sha, pins.branch));
  }
  for (const field of ['sha', 'tree', 'ci_run', 'previous_id']) {
    assert.throws(() => assertDispatch({ inputs: { ...inputs, [field]: 'foreign' } }, env, sha, pins.branch));
  }
});

test('inspect performs no POST and records only digests/explicit unknowns', async () => {
  const a = actions();
  const result = await operate('inspect', a, {});
  assert.equal(result.status, 'owner-baseline-inspected');
  assert.equal(a.calls.post, 0);
  assert.equal(result.flagAbsentAllScopes, true);
  assert.equal(result.unrelatedSecretEffectiveValuesCompared, false);
  const text = JSON.stringify(a.calls.saved);
  assert.ok(!text.includes(key));
  assert.ok(!text.includes('[SENSITIVE]'));
  assert.equal(result.fourBackend.length, 4);
});

test('unexpected effective value fails but preserves safe diagnostic evidence before strict guard', async () => {
  for (const name of [flagKey, 'SUPABASE_URL']) {
    const x = fixture();
    x.environment[name] = 'must-never-output-private-effective-value';
    const a = actions(x);
    const result = await operate('inspect', a, {});
    assert.equal(result.status, 'failed-stopped-no-deployment');
    assert.equal(result.phase, 'strict-backend-and-flags');
    assert.equal(a.calls.post, 0);
    assert.equal(result.flagAbsentAllScopes, true);
    assert.deepEqual(result.flagRows, []);
    assert.equal(result.fourBackendDiagnostic.length, 4);
    if (name === flagKey) {
      assert.equal(result.effectiveFrontFlagKind, 'other');
    } else {
      assert.equal(result.fourBackendDiagnostic.find((row) => row.key === name).ownerEffectiveMatched, false);
    }
    assert.ok(!JSON.stringify(a.calls.saved).includes('must-never-output-private-effective-value'));
    assert.equal(result.frontendFlagEffective, undefined);
  }
});

test('inspect can report existing encrypted/unreadable flag without pretending plaintext', async () => {
  const row = { ...flag(), type: 'sensitive', value: '[SENSITIVE]' };
  const x = flagEvidence([row])[0];
  assert.equal(x.boolean, null);
  assert.equal(x.valueSha256, null);
  assert.equal(x.valueReadable, false);
});

test('all-scope absence refuses preview/shared/branch/custom/integration/system rows', () => {
  for (const change of [
    { target: ['preview'] },
    { target: ['production', 'preview'] },
    { gitBranch: 'x' },
    { customEnvironmentIds: ['custom'] },
    { configurationId: 'integration' },
    { system: true },
  ]) {
    assert.throws(() => assertAbsent([...fixture().rows, { ...flag(), ...change }]));
  }
});

test('bootstrap creates one plain production false only, no alias/deploy action', async () => {
  const a = actions();
  const result = await operate('bootstrap-false', a, {});
  assert.equal(a.calls.post, 1);
  assert.equal(result.status, 'production-false-flag-bootstrapped-no-deployment');
  assert.equal(result.createdFlag.boolean, false);
  assert.equal(result.deploymentPerformed, false);
  assert.equal(result.productionAliasesChanged, false);
});

test('existing flag prevents bootstrap even if effective false', async () => {
  const x = fixture();
  x.rows.push(flag());
  x.flagRows.push(flag());
  x.environment[flagKey] = 'false';
  const a = actions(x);
  const result = await operate('bootstrap-false', a, {});
  assert.equal(result.status, 'failed-stopped-no-deployment');
  assert.equal(a.calls.post, 0);
});

test('missing prior inspection cannot authorize POST', async () => {
  const a = actions();
  a.assertPrior = async () => {
    throw new Error('private error body must not leak');
  };
  const result = await operate('bootstrap-false', a, {});
  assert.equal(a.calls.post, 0);
  assert.equal(result.phase, 'prior-inspection-and-absence');
  assert.ok(!JSON.stringify(result).includes('private error'));
});

test('fresh unrelated visible metadata drift refuses before POST', async () => {
  const a = actions();
  let n = 0;
  a.snapshot = async () => {
    const x = fixture();
    if (++n === 2) {
      x.rows.at(-1).updatedAt++;
    }
    return x;
  };
  const result = await operate('bootstrap-false', a, {});
  assert.equal(a.calls.post, 0);
  assert.equal(result.status, 'failed-stopped-no-deployment');
});

test('lost creation response never retries or compensates', async () => {
  const a = actions();
  a.create = async () => {
    a.calls.post++;
    throw new Error('token-secret-response');
  };
  const result = await operate('bootstrap-false', a, {});
  assert.equal(a.calls.post, 1);
  assert.equal(result.failureCategory, 'creation-unverified-operator-inspection-required');
  assert.equal(result.noAutomaticRetryOrCompensation, true);
  assert.ok(!JSON.stringify(result).includes('token-secret'));
});

test('creation returned foreign ID/scopes/value/timestamp refuses', () => {
  for (const change of [
    { id: 'foreign' },
    { target: ['preview'] },
    { value: 'true' },
    { type: 'encrypted' },
    { updatedAt: null },
    { visibility: 'secret' },
  ]) {
    assert.throws(() => assertCreated({ created: { ...flag(), ...change }, failed: [] }, flag()));
  }
  assert.throws(() => assertCreated({ created: flag(), failed: [{ private: 'not logged' }] }, flag()));
});

test('only one new row is allowed; visible old row representation exact', () => {
  const before = fixture().rows;
  const after = [...structuredClone(before), flag()];
  assertSingleAddition(before, after, flag());
  after[0].value = 'foreign';
  assert.throws(() => assertSingleAddition(before, after, flag()));
  assert.throws(() => assertSingleAddition(before, [...before, flag(), { ...flag(), id: 'second' }], flag()));
});

test('effective configuration permits only false flag addition, not secret representation/key drift', () => {
  const before = fixture().environment;
  assertEffectiveAddition(before, { ...before, [flagKey]: 'false' });
  for (const change of [{ [flagKey]: 'true' }, { PRIVATE_CONFIG: 'changed' }, { UNRELATED_ADDED: 'value' }]) {
    assert.throws(() => assertEffectiveAddition(before, { ...before, [flagKey]: 'false', ...change }));
  }
});

test('backend raw URL/key/aliases/source/signup guards stay exact', () => {
  const x = fixture();
  assertBackend(x.readableRows, x.environment, x.canonical, x.custom);
  const wrong = structuredClone(x);
  wrong.custom.id = 'dpl_foreign';
  assert.throws(() => assertBackend(wrong.readableRows, wrong.environment, wrong.canonical, wrong.custom));
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_ENABLE_SIGNUP', 'VITE_REQUIRE_AUTH']) {
    const z = fixture();
    z.environment[name] += ' ';
    assert.throws(() => assertBackend(z.readableRows, z.environment, z.canonical, z.custom));
  }
  const z = fixture();
  z.canonical.meta.publicKeySha256 = 'f'.repeat(64);
  assert.throws(() => assertBackend(z.readableRows, z.environment, z.canonical, z.custom));
});

test('prior proof binds source/run/age/main/absence/current owner representations', async () => {
  const x = fixture();
  const a = actions(x);
  const proof = await operate('inspect', a, { mode: 'inspect', sourceSha: sha, sourceBranch: pins.branch, sourceRunId: '122' });
  const checkEnv = { ...env, absence_inspection_run: '122' };
  assertPriorProof(proof, checkEnv, x);
  for (const change of [
    { sourceSha: 'b'.repeat(40) },
    { sourceRunId: '999' },
    { flagAbsentAllScopes: false },
    { mainSha: 'c'.repeat(40) },
    { checkedAtUtc: '2000-01-01T00:00:00Z' },
  ]) {
    assert.throws(() => assertPriorProof({ ...proof, ...change }, checkEnv, x));
  }
  const changed = fixture();
  changed.rows.at(-1).updatedAt++;
  assert.throws(() => assertPriorProof(proof, checkEnv, changed));
});

test('owner inventory rejects incomplete IDs/duplicates rather than assume ABSENT', () => {
  assert.throws(() => inventoryHash([{ key: flagKey }]));
  assert.throws(() => inventoryHash([flag(), flag()]));
});

test('temporary operator job is manual same-branch with shared concurrency; automatic publication unchanged', () => {
  const text = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const publish = text.slice(text.indexOf('  publish:'), text.indexOf('  # Temporary operator'));
  // Original publish job bytes (normalized line endings only); no private QA dependency.
  assert.equal(digest(publish.replaceAll('\r\n', '\n').trim()), 'd7d52c97a8e3a3c93a125f0f6e71b9f317b47dfd838b89e9d1ddfa91e30423fd');
  assert.ok(text.includes('workflow_run:'));
  assert.ok(text.includes("group: deploy-${{ github.event.workflow_run.head_branch || 'main' }}"));
  const operator = text.slice(text.indexOf('  owner-baseline:'));
  assert.ok(operator.includes('ref: ${{ github.ref }}'));
  assert.ok(operator.includes('if: always()'));
  assert.ok(operator.includes(`github.ref == 'refs/heads/${pins.branch}'`));
  assert.ok(text.includes('options: [inspect, enable, disable]'));
  assert.ok(text.includes('options: [inspect, bootstrap-false, bootstrap-signup-false]'));
  assert.ok(operator.includes("inputs.mode == 'inspect'"));
  assert.ok(operator.includes('OPERATOR_MODE: ${{ inputs.operator_mode }}'));
  assert.ok(operator.includes('vercel@60.1.3'));
  assert.ok(!operator.includes('playwright'));
  assert.ok(!operator.includes('node scripts/ci/deploy.mjs'));
});

test('missing signup is inspected honestly, never treated as false for telemetry creation', async () => {
  const x = fixture();
  delete x.environment[signupKey];
  x.rows = x.rows.filter((row) => row.key !== signupKey);
  x.readableRows = x.rows;
  const a = actions(x);
  const r = await operate('inspect', a, {});
  assert.equal(r.status, 'owner-baseline-inspected');
  assert.equal(r.effectiveSignupKind, 'missing');
  assert.equal(r.signupEnabled, null);
  assert.equal(r.signupAbsentAllScopes, true);
  assert.deepEqual(r.signupRows, []);
  const b = actions(x);
  assert.equal((await operate('bootstrap-false', b, {})).status, 'failed-stopped-no-deployment');
  assert.equal(b.calls.post, 0);
});

test('signup bootstrap creates only one production false; telemetry remains absent', async () => {
  const x = fixture();
  delete x.environment[signupKey];
  x.rows = x.rows.filter((row) => row.key !== signupKey);
  x.readableRows = x.rows;
  const a = actions(x, signupKey);
  const r = await operate('bootstrap-signup-false', a, {});
  assert.equal(r.status, 'production-false-flag-bootstrapped-no-deployment');
  assert.equal(a.calls.post, 1);
  assert.equal(r.createdFlagKey, signupKey);
  assert.equal(r.createdFlag.boolean, false);
  assert.equal(r.frontendFlagEffective, null);
});

test('signup all-scope existing row and wrong effective value prohibit creation', async () => {
  for (const target of [['preview'], ['production'], ['production', 'preview']]) {
    const x = fixture();
    delete x.environment[signupKey];
    x.rows = x.rows.filter((row) => row.key !== signupKey);
    x.readableRows = x.rows;
    x.rows.push({ ...flag(signupKey), target });
    const a = actions(x, signupKey);
    assert.equal((await operate('bootstrap-signup-false', a, {})).status, 'failed-stopped-no-deployment');
    assert.equal(a.calls.post, 0);
  }
  const x = fixture();
  x.environment[signupKey] = 'true';
  const a = actions(x, signupKey);
  assert.equal((await operate('bootstrap-signup-false', a, {})).status, 'failed-stopped-no-deployment');
  assert.equal(a.calls.post, 0);
});

test('signup prior proof requires successful inspect and selected-key absence, not old failed receipt', async () => {
  const x = fixture();
  delete x.environment[signupKey];
  x.rows = x.rows.filter((row) => row.key !== signupKey);
  x.readableRows = x.rows;
  const proof = await operate('inspect', actions(x), { mode: 'inspect', sourceSha: sha, sourceBranch: pins.branch, sourceRunId: '122' });
  const e = { ...env, absence_inspection_run: '122' };
  assertPriorProof(proof, e, x, Date.now(), signupKey);
  for (const c of [{ status: 'failed-stopped-no-deployment' }, { signupAbsentAllScopes: false }, { signupRows: [{ id: 'x' }] }]) {
    assert.throws(() => assertPriorProof({ ...proof, ...c }, e, x, Date.now(), signupKey));
  }
  const changed = structuredClone(x);
  changed.environment[signupKey] = 'false';
  assert.throws(() => assertPriorProof(proof, e, changed, Date.now(), signupKey));
});

test('finite key allowlist refuses arbitrary keys and cross-key POST response', () => {
  assert.throws(() => assertAbsent(fixture().rows, 'ARBITRARY'));
  assert.throws(() => assertCreated({ created: flag(), failed: [] }, flag(), signupKey));
  const before = fixture().environment;
  delete before[signupKey];
  assertEffectiveAddition(before, { ...before, [signupKey]: 'false' }, signupKey);
  assert.throws(() => assertEffectiveAddition(before, { ...before, [signupKey]: 'false', [flagKey]: 'false' }, signupKey));
  const bootstrap = {
    ...inputs,
    operator_mode: 'bootstrap-signup-false',
    absence_inspection_run: '122',
    absence_receipt_sha256: 'c'.repeat(64),
  };
  assert.equal(assertDispatch({ inputs: bootstrap }, env, sha, pins.branch).operator_mode, 'bootstrap-signup-false');
  assert.throws(() => assertDispatch({ inputs: { ...bootstrap, absence_inspection_run: '' } }, env, sha, pins.branch));
});

test('lost signup creation response never retries, compensates, or exposes provider error', async () => {
  const x = fixture();
  delete x.environment[signupKey];
  x.rows = x.rows.filter((row) => row.key !== signupKey);
  x.readableRows = x.rows;
  const a = actions(x, signupKey);
  a.create = async () => {
    a.calls.post++;
    throw Error('private-secret-error');
  };
  const r = await operate('bootstrap-signup-false', a, {});
  assert.equal(a.calls.post, 1);
  assert.equal(r.failureCategory, 'creation-unverified-operator-inspection-required');
  assert.ok(!JSON.stringify(r).includes('private-secret-error'));
});

test('telemetry bootstrap requires dedicated signup owner row, not effective false alone', async () => {
  const changes = [
    { missing: true },
    { target: ['production', 'preview'] },
    { system: true },
    { configurationId: 'integration' },
    { gitBranch: 'branch' },
    { customEnvironmentIds: ['custom'] },
    { visibility: 'secret' },
    { type: 'sensitive' },
    { updatedAt: null },
  ];
  for (const change of changes) {
    const x = fixture();
    const row = x.rows.find((row) => row.key === signupKey);
    if (change.missing) {
      x.rows = x.rows.filter((row) => row.key !== signupKey);
      x.readableRows = x.rows;
    } else {
      Object.assign(row, change);
    }
    const a = actions(x);
    const r = await operate('bootstrap-false', a, {});
    assert.equal(r.status, 'failed-stopped-no-deployment');
    assert.equal(a.calls.post, 0);
  }
});

test('inspect rejects present production signup managed scopes instead of accepting false', async () => {
  for (const change of [
    { target: ['production', 'preview'] },
    { configurationId: 'integration' },
    { system: true },
    { gitBranch: 'x' },
    { customEnvironmentIds: ['custom'] },
  ]) {
    const x = fixture();
    Object.assign(
      x.rows.find((row) => row.key === signupKey),
      change,
    );
    const a = actions(x);
    const r = await operate('inspect', a, {});
    assert.equal(r.status, 'failed-stopped-no-deployment');
    assert.equal(a.calls.post, 0);
  }
});

test('fresh CAS diagnostics expose only valid changed key names and never relax equality', async () => {
  for (const scenario of ['effective', 'backend', 'inventory', 'invalid-key']) {
    const before = fixture();
    before.environment.VERCEL_OIDC_TOKEN = 'private-token-before';
    let count = 0;
    const a = actions(before);
    a.snapshot = async () => {
      const x = structuredClone(before);
      if (++count === 2) {
        if (scenario === 'effective') {
          x.environment.VERCEL_OIDC_TOKEN = 'private-token-after';
        }
        if (scenario === 'backend') {
          x.environment.SUPABASE_URL = 'private-backend-after';
        }
        if (scenario === 'inventory') {
          x.rows.at(-1).updatedAt++;
        }
        if (scenario === 'invalid-key') {
          x.environment['private-secret-key-name!'] = 'private-invalid-value';
        }
      }
      return x;
    };
    const r = await operate('inspect', a, {});
    assert.equal(r.status, 'failed-stopped-no-deployment');
    assert.equal(r.phase, 'fresh-owner-cas');
    assert.equal(a.calls.post, 0);
    assert.equal(r.ownerRepresentationEqual, scenario !== 'inventory');
    assert.equal(r.effectiveRepresentationEqual, scenario === 'inventory');
    const expectedKeys = { effective: ['VERCEL_OIDC_TOKEN'], backend: ['SUPABASE_URL'], inventory: [], 'invalid-key': [] };
    assert.deepEqual(r.changedEffectiveKeyNames, expectedKeys[scenario]);
    assert.equal(r.changedInvalidEffectiveKeyCount, scenario === 'invalid-key' ? 1 : 0);
    assert.equal(r.freshDiagnostics.fourBackendDiagnostic.length, 4);
    const serialized = JSON.stringify(a.calls.saved);
    for (const secret of [
      'private-token-before',
      'private-token-after',
      'private-backend-after',
      'private-secret-key-name!',
      'private-invalid-value',
    ]) {
      assert.ok(!serialized.includes(secret));
    }
  }
});
