import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import {
  appendCutoverOverrides,
  assertBackendAlignment,
  assertCandidate,
  assertClosedGate,
  cutoverEnvironment,
  digest,
  hostedUrl,
  productionRows,
  promoteCutover,
  sameRow,
  sanitizedRows,
  targetUrl,
} from './cutover-policy.mjs';
import { assertReleaseRun, releaseTargets } from './release-policy.mjs';

const key = 'sb_publishable_fixture';
const environment = cutoverEnvironment({}, key);
const hostedKey = 'sb_publishable_hosted';
const hosted = { VITE_SUPABASE_URL: hostedUrl, VITE_SUPABASE_ANON_KEY: hostedKey, VITE_REQUIRE_AUTH: 'true' };
test('server override mismatch and Hosted rollback after managed VPS publication stop ordinary deployment', () => {
  assert.doesNotThrow(() => assertBackendAlignment(hosted, releaseTargets.main, { meta: {} }));
  assert.throws(() => assertBackendAlignment({ ...hosted, SUPABASE_URL: targetUrl }, releaseTargets.main));
  assert.throws(() => assertBackendAlignment({ ...hosted, SUPABASE_ANON_KEY: key }, releaseTargets.main));
  assert.throws(() => assertBackendAlignment(hosted, releaseTargets.main, { meta: { backendUrl: targetUrl } }));
  assert.throws(() => assertBackendAlignment(environment, releaseTargets.main, { meta: {} }));
  assert.doesNotThrow(() => assertBackendAlignment(environment, releaseTargets.main, { meta: { backendUrl: targetUrl } }));
});
test('target key must be public, single-line and aligned across browser and server', () => {
  for (const value of ['service-role', key + '\n', key + ' ', 'sb_publishable_a\rINJECT=x', '']) {
    assert.throws(() => cutoverEnvironment({}, value));
  }
  assert.equal(environment.SUPABASE_ANON_KEY, environment.VITE_SUPABASE_ANON_KEY);
  assert.equal(environment.SUPABASE_URL, environment.VITE_SUPABASE_URL);
  assert.equal(environment.VITE_ENABLE_SIGNUP, 'false');
  assert.equal(environment.VITE_PRODUCT_TELEMETRY_ENABLED, 'false');
});
const row = (name, value, id = name) => ({ key: name, id, value, target: ['production'], type: 'plain', updatedAt: 1 });
test('production update rejects duplicate, shared and unreadable scopes while preserving preview rows', () => {
  assert.equal(
    productionRows([row('SUPABASE_URL', hostedUrl), { ...row('SUPABASE_URL', 'preview'), target: ['preview'] }])[2].row.value,
    hostedUrl,
  );
  for (const patch of [
    { target: ['production', 'preview'] },
    { type: 'sensitive' },
    { visibility: 'secret' },
    { gitBranch: 'main' },
    { configurationId: 'integration' },
    { system: true },
    { customEnvironmentIds: ['custom'] },
  ]) {
    assert.throws(() => productionRows([{ ...row('VITE_SUPABASE_URL', hostedUrl), ...patch }]));
  }
  assert.throws(() => productionRows([row('SUPABASE_URL', hostedUrl), row('SUPABASE_URL', hostedUrl, 'duplicate')]));
  assert.equal(productionRows([]).length, 4);
});
test('inspection receipt contains public URLs and key digests, never key values or unrelated secrets', () => {
  const rows = [row('VITE_SUPABASE_URL', hostedUrl), row('VITE_SUPABASE_ANON_KEY', hostedKey), row('RESEND_API_KEY', 'hidden')];
  const output = JSON.stringify(sanitizedRows(rows));
  assert.ok(output.includes(hostedUrl));
  assert.ok(output.includes(digest(hostedKey)));
  assert.ok(!output.includes(hostedKey) && !output.includes('hidden') && !output.includes('RESEND'));
});
test('same-state guard includes ID, timestamp, value and target scopes', () => {
  const before = row('SUPABASE_URL', hostedUrl);
  assert.ok(sameRow(before, { ...before }));
  for (const patch of [{ id: 'other' }, { updatedAt: 2 }, { value: targetUrl }, { target: ['production', 'preview'] }]) {
    assert.ok(!sameRow(before, { ...before, ...patch }));
  }
});
test('closed gate requires both exact paths, marker and Retry-After, with no JWT or redirects', async () => {
  const seen = [];
  await assertClosedGate(
    async (url, options) => {
      seen.push(url);
      assert.equal(options.redirect, 'error');
      assert.deepEqual(options.headers, { apikey: key });
      return new Response(null, { status: 503, headers: { 'X-Trajectory-Target-Gate': 'fixture', 'Retry-After': '300' } });
    },
    key,
    'fixture',
  );
  assert.deepEqual(seen, [targetUrl + '/auth/v1/user', targetUrl + '/rest/v1/trajectory_snapshots?select=user_id&limit=0']);
  for (const headers of [{}, { 'X-Trajectory-Target-Gate': 'other', 'Retry-After': '300' }]) {
    await assert.rejects(assertClosedGate(async () => new Response(null, { status: 503, headers }), key, 'fixture'));
  }
  await assert.rejects(assertClosedGate(async () => new Response(null, { status: 200 }), key, 'fixture'));
});
test('manual operation preserves exact successful current-main push-CI requirement', () => {
  const sha = 'a'.repeat(40);
  const run = {
    event: 'push',
    path: '.github/workflows/ci.yml',
    head_repository: { full_name: 'owner/project' },
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    head_branch: 'main',
  };
  assert.doesNotThrow(() => assertReleaseRun(run, 'owner/project', sha, 'main', sha));
  for (const patch of [{ event: 'pull_request' }, { head_branch: 'develop' }, { conclusion: 'failure' }]) {
    assert.throws(() => assertReleaseRun({ ...run, ...patch }, 'owner/project', sha, 'main', sha));
  }
  assert.throws(() => assertReleaseRun(run, 'owner/project', sha, 'main', 'b'.repeat(40)));
});
function fixture(failure, absentServer = false) {
  const previous = { id: 'old' };
  const candidate = { id: 'new' };
  let alias = previous;
  let rows = [
    row('VITE_SUPABASE_URL', hostedUrl),
    row('VITE_SUPABASE_ANON_KEY', hostedKey),
    ...(!absentServer ? [row('SUPABASE_URL', hostedUrl), row('SUPABASE_ANON_KEY', hostedKey)] : []),
    { ...row('VITE_SUPABASE_URL', 'preview'), id: 'preview', target: ['preview'] },
  ];
  const original = structuredClone(rows);
  const events = [];
  let gateCalls = 0;
  const actions = {
    assertCurrent: async () => {
      events.push('current');
    },
    assertGate: async () => {
      gateCalls++;
      events.push('gate');
      if (failure === 'open-gate') {
        throw new Error('gate open');
      }
    },
    inspectAlias: async () => alias,
    smoke: async () => {
      events.push('smoke');
    },
    readRows: async () => structuredClone(rows),
    putRow: async (name, value, before) => {
      const after = { ...row(name, value, before?.id || 'created-' + name), updatedAt: 2 };
      rows = rows.filter((entry) => entry.id !== after.id);
      rows.push(after);
      events.push('put:' + name);
      return structuredClone(after);
    },
    restoreRow: async ({ key: name, before, after }) => {
      rows = rows.filter((entry) => entry.id !== after.id);
      if (before) {
        rows.push(structuredClone(before));
      }
      events.push('restore:' + name);
    },
    verifyEnvironment: async () => {
      if (failure === 'changed-env') {
        rows.find((entry) => entry.key === 'SUPABASE_URL' && entry.target[0] === 'production').value = 'other';
        throw new Error('external update');
      }
      if (failure === 'verify-env') {
        throw new Error('environment verification failed');
      }
      events.push('env-verified');
    },
    promote: async (deployment) => {
      alias = deployment;
      events.push('promote:' + deployment.id);
      if (failure === 'ambiguous-promote' && deployment.id === 'new') {
        throw new Error('response lost');
      }
    },
    verifyAlias: async (deployment) => {
      if (failure === 'third-party' && deployment.id === 'new') {
        alias = { id: 'third-party' };
        throw new Error('another operator');
      }
      if (failure === 'verify-alias' && deployment.id === 'new') {
        throw new Error('verification failed');
      }
    },
  };
  return {
    input: { candidate, previous, environment, beforeUserWrites: true },
    actions,
    events,
    original,
    rows: () => rows,
    alias: () => alias,
    gateCalls: () => gateCalls,
  };
}
test('successful cutover aligns four production parameters before alias promotion and preserves preview', async () => {
  const state = fixture();
  await promoteCutover(state.input, state.actions);
  assert.equal(state.alias().id, 'new');
  assert.ok(state.events.indexOf('env-verified') < state.events.indexOf('promote:new'));
  for (const { key: name, row: actual } of productionRows(state.rows())) {
    assert.equal(actual.value, environment[name]);
  }
  assert.deepEqual(
    state.rows().find((entry) => entry.id === 'preview'),
    state.original.find((entry) => entry.id === 'preview'),
  );
  assert.ok(state.gateCalls() >= 7);
});
for (const failure of ['verify-env', 'verify-alias', 'ambiguous-promote']) {
  test(failure + ' restores only own exact env and alias before user writes', async () => {
    const state = fixture(failure, true);
    await assert.rejects(promoteCutover(state.input, state.actions));
    assert.equal(state.alias().id, 'old');
    assert.deepEqual(
      state.rows().sort((a, b) => a.id.localeCompare(b.id)),
      state.original.sort((a, b) => a.id.localeCompare(b.id)),
    );
  });
}
for (const failure of ['third-party', 'changed-env']) {
  test(failure + ' is never overwritten during compensation', async () => {
    const state = fixture(failure);
    await assert.rejects(promoteCutover(state.input, state.actions));
    if (failure === 'third-party') {
      assert.equal(state.alias().id, 'third-party');
      assert.ok(!state.events.includes('promote:old'));
      assert.ok(!state.events.some((entry) => entry.startsWith('restore:')));
    } else {
      assert.equal(state.rows().find((entry) => entry.key === 'SUPABASE_URL').value, 'other');
    }
  });
}
test('closed gate and no-user-writes declaration are required before any mutation', async () => {
  const state = fixture('open-gate');
  await assert.rejects(promoteCutover(state.input, state.actions));
  assert.ok(!state.events.some((entry) => entry.startsWith('put:') || entry.startsWith('promote:')));
  const undeclared = fixture();
  await assert.rejects(promoteCutover({ ...undeclared.input, beforeUserWrites: false }, undeclared.actions));
  assert.deepEqual(undeclared.events, []);
});

test('ambiguous env writes require intervention and never blindly restore an unknown row', async () => {
  const state = fixture();
  const put = state.actions.putRow;
  state.actions.putRow = async (...args) => {
    await put(...args);
    throw new Error('write response lost');
  };
  await assert.rejects(promoteCutover(state.input, state.actions), /not our exact state/);
  assert.equal(state.alias().id, 'old');
  assert.ok(!state.events.some((entry) => entry.startsWith('restore:')));
});
test('gate opening after promotion prevents any Hosted compensation', async () => {
  const state = fixture();
  const assertGate = state.actions.assertGate;
  state.actions.assertGate = async () => {
    if (state.alias().id === 'new') {
      throw new Error('writes may have opened');
    }
    await assertGate();
  };
  await assert.rejects(promoteCutover(state.input, state.actions));
  assert.equal(state.alias().id, 'new');
  assert.ok(!state.events.includes('promote:old'));
  assert.ok(!state.events.some((entry) => entry.startsWith('restore:')));
});
test('environment changed after snapshot is refused before it is overwritten', async () => {
  const state = fixture();
  const read = state.actions.readRows;
  let snapshotRead = false;
  state.actions.readRows = async () => {
    const rows = await read();
    if (snapshotRead) {
      rows.find((entry) => entry.key === 'VITE_SUPABASE_URL' && entry.target[0] === 'production').updatedAt = 9;
    }
    snapshotRead = true;
    return rows;
  };
  await assert.rejects(promoteCutover(state.input, state.actions), /changed before update/);
  assert.ok(!state.events.some((entry) => entry.startsWith('put:')));
});

test('candidate source, CI, previous ID and public key digest must match the immutable deployment', () => {
  const sha = 'a'.repeat(40);
  const meta = {
    sourceSha: sha,
    ciRun: '123',
    cutover: 'vps-candidate',
    backendUrl: targetUrl,
    previousDeployment: 'old',
    publicKeySha256: digest(key),
  };
  assert.doesNotThrow(() => assertCandidate({ meta }, sha, 123, 'old', key));
  for (const patch of [
    { sourceSha: 'b'.repeat(40) },
    { ciRun: '124' },
    { cutover: 'other' },
    { backendUrl: hostedUrl },
    { previousDeployment: 'other' },
    { publicKeySha256: digest(hostedKey) },
  ]) {
    assert.throws(() => assertCandidate({ meta: { ...meta, ...patch } }, sha, 123, 'old', key));
  }
});

test('build overrides append only eight safe bindings and preserve every raw baseline byte and unrelated parsed value', () => {
  const baseline = [
    '# keep comments',
    'RESEND_API_KEY="first\\nsecond"',
    'OTHER="escaped \\"quote\\" and \\\\path"',
    "MULTILINE='first\nVITE_SUPABASE_URL=inside-secret\nlast'",
    'VITE_SUPABASE_URL="' + hostedUrl + '"',
  ].join('\r\n');
  const result = appendCutoverOverrides(baseline, key);
  assert.ok(result.startsWith(baseline + '\n'));
  assert.deepEqual(
    result
      .slice(baseline.length + 1)
      .trim()
      .split('\n'),
    Object.entries(environment).map(([name, value]) => name + '=' + value),
  );
  const parsed = parseEnv(result);
  const original = parseEnv(baseline);
  for (const name of ['RESEND_API_KEY', 'OTHER', 'MULTILINE']) {
    assert.equal(parsed[name], original[name]);
  }
  for (const [name, value] of Object.entries(environment)) {
    assert.equal(parsed[name], value);
  }
  assert.equal(Object.keys(environment).length, 8);
});

test('dispatch executes only the current main workflow source before exposing publishing credentials', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/cutover.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes("github.ref == 'refs/heads/main' && inputs.sha == github.sha"));
  assert.ok(workflow.includes('ref: ${{ github.sha }}'));
  assert.ok(!workflow.includes('ref: ${{ inputs.sha }}'));
  assert.ok(workflow.includes('group: deploy-main'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
  assert.ok(!workflow.includes('continue-on-error'));
});
