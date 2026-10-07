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
  cutoverFailureName,
  digest,
  hostedUrl,
  productionRows,
  promoteCutover,
  readableProductionRows,
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
test('readability resolves only encrypted allowlisted Production rows and preserves raw plaintext bytes', async () => {
  const cipher = { ...row('VITE_SUPABASE_URL', 'synthetic-ciphertext'), type: 'encrypted', decrypted: false };
  const readable = { ...row('SUPABASE_ANON_KEY', hostedKey), type: 'encrypted', decrypted: true };
  const preview = { ...cipher, id: 'preview', target: ['preview'] };
  const unrelated = { ...row('RESEND_API_KEY', 'unrelated-ciphertext'), type: 'encrypted' };
  const rows = [cipher, readable, preview, unrelated, row('SUPABASE_URL', hostedUrl)];
  const before = structuredClone(rows);
  const requests = [];
  const rawValue = ' \r\n' + hostedUrl + '\t';
  const result = await readableProductionRows(rows, async (id) => {
    requests.push(id);
    return { ...cipher, value: rawValue, decrypted: true };
  });
  assert.deepEqual(requests, [cipher.id]);
  assert.deepEqual(rows, before);
  assert.equal(result[0].value, rawValue);
  assert.equal(sanitizedRows(result)[0].rows[0].url, hostedUrl);
  assert.ok(sameRow(result[0], { ...cipher, value: rawValue, decrypted: true }));
  assert.ok(!sameRow(result[0], { ...result[0], value: hostedUrl }));
  for (let n = 1; n < rows.length; n++) {
    assert.equal(result[n], rows[n]);
  }
});

test('readability bridges documented LIST/GET defaults while retaining LIST authority fields', async () => {
  const listed = {
    id: 'env-url',
    key: 'VITE_SUPABASE_URL',
    type: 'encrypted',
    value: 'ciphertext',
    target: ['production'],
    updatedAt: 17,
    system: false,
    configurationId: null,
    customEnvironmentIds: [],
    visibility: 'config',
    createdAt: 10,
  };
  const actual = {
    id: 'env-url',
    key: 'VITE_SUPABASE_URL',
    type: 'encrypted',
    value: ' \r\n' + hostedUrl,
    target: ['production'],
    updatedAt: 17,
    decrypted: true,
    visibility: 'config',
  };
  const result = await readableProductionRows([listed], async () => actual);
  assert.deepEqual(result, [{ ...listed, value: actual.value, decrypted: true }]);
  assert.equal(listed.value, 'ciphertext');
  assert.ok(!sameRow(listed, actual));
  for (const patch of [
    { id: 'other' },
    { key: 'SUPABASE_URL' },
    { type: 'plain' },
    { updatedAt: 18 },
    { target: ['preview'] },
    { target: ['production', 'preview'] },
    { system: null },
    { system: 0 },
    { system: true },
    { gitBranch: null },
    { gitBranch: 'main' },
    { configurationId: 'integration' },
    { configurationId: false },
    { customEnvironmentIds: null },
    { customEnvironmentIds: ['custom'] },
    { visibility: undefined },
    { visibility: 'secret' },
  ]) {
    await assert.rejects(readableProductionRows([listed], async () => ({ ...actual, ...patch })));
  }
  const legacyList = {
    id: 'legacy',
    key: 'SUPABASE_URL',
    type: 'encrypted',
    value: 'ciphertext',
    target: ['production'],
    updatedAt: 2,
  };
  const nullableDetail = {
    id: 'legacy',
    key: 'SUPABASE_URL',
    type: 'encrypted',
    value: hostedUrl,
    target: ['production'],
    updatedAt: 2,
    decrypted: true,
    configurationId: null,
    customEnvironmentIds: [],
    system: false,
  };
  assert.deepEqual(await readableProductionRows([legacyList], async () => nullableDetail), [
    { ...legacyList, value: hostedUrl, decrypted: true },
  ]);
  await assert.rejects(readableProductionRows([legacyList], async () => ({ ...nullableDetail, visibility: 'config' })));
  for (const patch of [{ system: null }, { system: 0 }, { gitBranch: null }, { customEnvironmentIds: null }, { configurationId: false }]) {
    let calls = 0;
    await assert.rejects(
      readableProductionRows([{ ...legacyList, ...patch }], async () => {
        calls++;
      }),
    );
    assert.equal(calls, 0);
  }
});

test('readability requires observed true decryption and exact ID/key/scope metadata', async () => {
  const cipher = { ...row('VITE_SUPABASE_ANON_KEY', 'ciphertext'), type: 'encrypted' };
  for (const patch of [
    { decrypted: false },
    { decrypted: undefined },
    { decrypted: 'true' },
    { id: 'foreign' },
    { key: 'RESEND_API_KEY' },
    { key: 'SUPABASE_ANON_KEY' },
    { updatedAt: 2 },
    { type: 'plain' },
    { visibility: 'secret' },
    { target: ['preview'] },
    { target: ['production', 'preview'] },
    { gitBranch: 'main' },
    { configurationId: 'integration' },
    { system: true },
    { customEnvironmentIds: ['custom'] },
    { value: undefined },
    { value: '[SENSITIVE]' },
  ]) {
    await assert.rejects(
      readableProductionRows([cipher], async () => ({
        ...cipher,
        value: hostedKey,
        decrypted: true,
        ...patch,
      })),
    );
  }
  const result = await readableProductionRows([cipher], async () => ({
    ...cipher,
    value: hostedKey,
    decrypted: true,
  }));
  assert.equal(sanitizedRows(result)[1].rows[0].sha256, digest(hostedKey));
  assert.ok(!JSON.stringify(sanitizedRows(result)).includes(hostedKey));
});

test('readability validates every selected scope before decrypting and stops on unreadable API response', async () => {
  const cipher = { ...row('VITE_SUPABASE_URL', 'ciphertext'), type: 'encrypted' };
  for (const extra of [
    { ...row('SUPABASE_URL', hostedUrl), target: ['production', 'preview'] },
    { ...row('SUPABASE_URL', hostedUrl), configurationId: 'integration' },
    { ...cipher, id: 'duplicate' },
  ]) {
    let calls = 0;
    await assert.rejects(
      readableProductionRows([cipher, extra], async () => {
        calls++;
      }),
    );
    assert.equal(calls, 0);
  }
  await assert.rejects(readableProductionRows([cipher], async () => null));
  await assert.rejects(
    readableProductionRows([cipher], async () => {
      throw new Error('synthetic HTTP failure');
    }),
  );
});

test('cutover failure classification emits only fixed names and separates smoke stages without raw errors', () => {
  for (const name of ['AssertionError', 'TypeError', 'TimeoutError', 'AbortError', 'Error']) {
    assert.equal(cutoverFailureName({ name, message: 'secret-value', stack: 'secret-stack' }), name);
  }
  for (const error of [undefined, null, { name: 'secret-name' }, { message: 'secret-value' }]) {
    assert.equal(cutoverFailureName(error), 'Error');
  }
  const source = readFileSync(new URL('./cutover.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('v1/projects/${projectId}/env/${encodeURIComponent(id)}'));
  assert.ok(source.includes('return readableProductionRows(rows,'));
  assert.ok(!source.includes('?decrypt=true'));
  const smoke = source.slice(source.indexOf('async function candidateSmoke'), source.indexOf('async function putRow'));
  const stages = ['candidate-public-smoke', 'candidate-js-asset-read', 'candidate-js-backend-check'];
  assert.ok(stages.every((stage, n) => smoke.indexOf(stage) >= 0 && (!n || smoke.indexOf(stage) > smoke.indexOf(stages[n - 1]))));
  const terminal = source.slice(source.lastIndexOf('} catch (error)'));
  assert.ok(terminal.includes('record.failureStage = record.progressStage'));
  assert.ok(terminal.includes('record.failureName = cutoverFailureName(error)'));
  assert.ok(!/error\.(message|stack|cause|args)|JSON\.stringify\(error/.test(terminal));
});

test('inspection receipt contains public URLs and key digests, never key values or unrelated secrets', () => {
  const rows = [row('VITE_SUPABASE_URL', hostedUrl), row('VITE_SUPABASE_ANON_KEY', hostedKey), row('RESEND_API_KEY', 'hidden')];
  const output = JSON.stringify(sanitizedRows(rows));
  assert.ok(output.includes(hostedUrl));
  assert.ok(output.includes(digest(hostedKey)));
  assert.ok(!output.includes(hostedKey) && !output.includes('hidden') && !output.includes('RESEND'));
});
test('inspection URL metadata recognizes only trimmed allowlisted endpoints and leaves raw rows unchanged', () => {
  for (const url of [hostedUrl, targetUrl]) {
    for (const value of [url, `\r\n${url}\r\n`, ` ${url} `, `\t${url}\t`]) {
      const rows = [row('VITE_SUPABASE_URL', value), row('SUPABASE_URL', value)];
      const before = structuredClone(rows);
      const output = sanitizedRows(rows);
      for (const name of ['VITE_SUPABASE_URL', 'SUPABASE_URL']) {
        const actual = output.find((entry) => entry.key === name).rows[0];
        assert.equal(actual.url, url);
        assert.equal(actual.rawUrlSha256, digest(value));
        assert.ok(!Object.hasOwn(actual, 'unexpectedUrl'));
        assert.equal(Object.hasOwn(actual, 'urlWhitespaceTrimmed'), value !== url);
        if (value !== url) {
          assert.equal(actual.urlWhitespaceTrimmed, true);
        }
      }
      assert.deepEqual(rows, before);
      assert.equal(productionRows(rows)[0].row.value, value);
    }
  }
});

test('inspection URL metadata refuses unknown and non-string values without disclosing them', () => {
  for (const value of [
    undefined,
    null,
    123,
    '',
    ' ',
    'https://unknown.example.invalid/private',
    `${hostedUrl}/`,
    `${hostedUrl}?secret=hidden`,
    `https://user:hidden@${new URL(hostedUrl).hostname}`,
    hostedUrl.replace('https:', 'http:'),
    hostedUrl.replace('.supabase.co', '.supabase. co'),
  ]) {
    const output = sanitizedRows([row('VITE_SUPABASE_URL', value)]);
    const actual = output[0].rows[0];
    assert.equal(actual.unexpectedUrl, true);
    assert.ok(!Object.hasOwn(actual, 'url') && !Object.hasOwn(actual, 'urlWhitespaceTrimmed') && !Object.hasOwn(actual, 'rawUrlSha256'));
    assert.ok(!Object.hasOwn(actual, 'value'));
    assert.ok(!JSON.stringify(output).includes('hidden') && !JSON.stringify(output).includes('unknown.example.invalid'));
  }
});

test('canonical metadata does not weaken exact raw-value CAS ownership', () => {
  const before = row('VITE_SUPABASE_URL', ` ${hostedUrl}\r\n`);
  const canonical = row('VITE_SUPABASE_URL', hostedUrl);
  assert.equal(sanitizedRows([before])[0].rows[0].url, sanitizedRows([canonical])[0].rows[0].url);
  assert.ok(!sameRow(before, canonical));
  assert.ok(sameRow(before, structuredClone(before)));
  assert.equal(before.value, ` ${hostedUrl}\r\n`);
});

test('canonical URL metadata retains exact raw whitespace drift through its digest', () => {
  const before = row('VITE_SUPABASE_URL', ' ' + hostedUrl + '\r\n');
  const changed = row('VITE_SUPABASE_URL', '\t' + hostedUrl + ' ');
  const a = sanitizedRows([before])[0].rows[0];
  const b = sanitizedRows([changed])[0].rows[0];
  assert.equal(a.url, b.url);
  assert.equal(a.urlWhitespaceTrimmed, true);
  assert.equal(b.urlWhitespaceTrimmed, true);
  assert.notEqual(a.rawUrlSha256, b.rawUrlSha256);
  assert.notDeepEqual(a, b);
  assert.ok(!JSON.stringify(a).includes(before.value));
});

test('compensation preserves the original whitespace URL bytes after canonical inspection', async () => {
  const state = fixture('verify-env', true);
  state.rows().find((entry) => entry.key === 'VITE_SUPABASE_URL' && entry.target[0] === 'production').value = ` \r\n${hostedUrl}\t`;
  const expected = structuredClone(state.rows());
  assert.equal(sanitizedRows(state.rows())[0].rows[0].url, hostedUrl);
  await assert.rejects(promoteCutover(state.input, state.actions));
  assert.deepEqual(
    state.rows().sort((a, b) => a.id.localeCompare(b.id)),
    expected.sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test('compensation restores decrypted encrypted originals rather than list ciphertext', async () => {
  const state = fixture('verify-env', true);
  for (const entry of state.rows().filter((entry) => entry.target[0] === 'production')) {
    entry.type = 'encrypted';
    entry.decrypted = true;
  }
  state.rows()[0].value = ' \r\n' + hostedUrl + '\t';
  const expected = structuredClone(state.rows());
  const read = state.actions.readRows;
  state.actions.readRows = async () => {
    const rows = (await read()).map((entry) =>
      entry.type === 'encrypted' ? { ...entry, value: 'synthetic-ciphertext', decrypted: false } : entry,
    );
    return readableProductionRows(rows, async (id) => structuredClone(state.rows().find((entry) => entry.id === id)));
  };
  await assert.rejects(promoteCutover(state.input, state.actions));
  assert.deepEqual(
    state.rows().sort((a, b) => a.id.localeCompare(b.id)),
    expected.sort((a, b) => a.id.localeCompare(b.id)),
  );
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
