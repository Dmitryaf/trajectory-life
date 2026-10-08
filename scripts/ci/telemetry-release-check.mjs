import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promoteVerified } from './release-policy.mjs';
import {
  assertTelemetryEnvironment,
  assertSignupEnvironment,
  assertOwnerInventory,
  signupFlag,
  readableSignupFlag,
  changeSignupFlag,
  signupKey,
  assertTelemetryTransition,
  changeTelemetryFlag,
  flagEvidence,
  readableTelemetryFlag,
  releaseSource,
  telemetryFlag,
  telemetryInspection,
} from './telemetry-release-policy.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const key = 'sb_publishable_fixture';
const url = 'https://api.trajectory-life.ru';
const previous = { id: 'dpl_previous', url: 'previous.vercel.app', meta: { backendUrl: url } };
const baseInput = { mode: 'inspect', sha, tree, ci_run: '123', previous_id: previous.id };
const flag = { id: 'flag-id', key: 'VITE_PRODUCT_TELEMETRY_ENABLED', value: 'false', type: 'plain', target: ['production'], updatedAt: 1 };
const rows = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'].map((name) => ({
  id: name,
  key: name,
  value: name.endsWith('_URL') ? url : key,
  type: 'plain',
  target: ['production'],
  updatedAt: 1,
}));
const environment = Object.fromEntries(rows.map((row) => [row.key, row.value]));
Object.assign(environment, {
  VITE_REQUIRE_AUTH: 'true',
  VITE_ENABLE_SIGNUP: 'false',
  VITE_PRODUCT_TELEMETRY_ENABLED: 'false',
  PRIVATE_SERVER_CONFIG: 'synthetic-do-not-record',
});
const dispatch = (input = baseInput, ref = 'refs/heads/main') => releaseSource({ inputs: input }, 'workflow_dispatch', ref, sha, tree);

test('automatic workflow_run source remains unchanged', () => {
  const source = { id: 12, head_branch: 'develop' };
  assert.equal(releaseSource({ workflow_run: source }, 'workflow_run', '', sha, tree), source);
});
test('dispatch inspect/default and emergency disable need no invented backend acceptance', () => {
  assert.equal(dispatch().head_branch, 'main');
  assert.equal(dispatch({ ...baseInput, mode: 'disable' }).telemetry.mode, 'disable');
});
test('enable requires both actual Root attestations and private receipt digests', () => {
  const approved = {
    ...baseInput,
    mode: 'enable',
    backend_accepted: 'true',
    post_open_backup_accepted: 'true',
    backend_receipt_sha256: 'c'.repeat(64),
    backup_receipt_sha256: 'd'.repeat(64),
  };
  assert.equal(dispatch(approved).telemetry.mode, 'enable');
  for (const name of ['backend_accepted', 'post_open_backup_accepted', 'backend_receipt_sha256', 'backup_receipt_sha256']) {
    assert.throws(() => dispatch({ ...approved, [name]: '' }));
  }
});
test('wrong ref/SHA/tree/CI/previous identity cannot dispatch', () => {
  assert.throws(() => dispatch(baseInput, 'refs/heads/develop'));
  for (const [name, value] of [
    ['sha', 'e'.repeat(40)],
    ['tree', 'f'.repeat(40)],
    ['ci_run', '123/path'],
    ['previous_id', 'foreign'],
    ['mode', 'promote'],
  ]) {
    assert.throws(() => dispatch({ ...baseInput, [name]: value }));
  }
});
test('only an explicit readable dedicated production flag is mutable', () => {
  assert.equal(telemetryFlag([flag]), flag);
  for (const change of [
    { target: ['production', 'preview'] },
    { gitBranch: 'main' },
    { system: true },
    { configurationId: 'foreign' },
    { customEnvironmentIds: ['custom'] },
    { type: 'sensitive' },
    { visibility: 'secret' },
    { updatedAt: undefined },
    { value: ' true' },
  ]) {
    assert.throws(() => telemetryFlag([{ ...flag, ...change }]));
  }
  assert.throws(() => telemetryFlag([flag, flag]));
  assert.throws(() => telemetryFlag([]));
});
test('encrypted LIST/GET defaults preserve LIST authority and actual plaintext only', async () => {
  const listed = { ...flag, value: 'ciphertext', type: 'encrypted' };
  const actual = { ...listed, value: 'false', decrypted: true, system: false, configurationId: null, customEnvironmentIds: [] };
  assert.deepEqual(await readableTelemetryFlag([listed], async () => actual), { ...listed, value: 'false', decrypted: true });
  for (const change of [{ decrypted: false }, { updatedAt: 2 }, { target: ['preview'] }, { visibility: 'public' }, { id: 'other' }]) {
    await assert.rejects(readableTelemetryFlag([listed], async () => ({ ...actual, ...change })));
  }
});
test('all four raw/effective VPS rows, auth and signup remain exact', () => {
  assertTelemetryEnvironment(environment, rows, previous, previous.id);
  for (const change of [
    { SUPABASE_URL: ' ' + url },
    { SUPABASE_ANON_KEY: 'sb_publishable_other' },
    { VITE_ENABLE_SIGNUP: 'other' },
    { VITE_REQUIRE_AUTH: 'false' },
  ]) {
    assert.throws(() => assertTelemetryEnvironment({ ...environment, ...change }, rows, previous, previous.id));
  }
  assert.throws(() =>
    assertTelemetryEnvironment(environment, rows, { ...previous, meta: { backendUrl: 'https://hosted.supabase.co' } }, previous.id),
  );
  assert.throws(() => assertTelemetryEnvironment(environment, rows.slice(1), previous, previous.id));
});
test('effective config or backend row drift refuses before build', () => {
  const after = { ...environment, VITE_PRODUCT_TELEMETRY_ENABLED: 'true' };
  assertTelemetryTransition(environment, after, rows, rows, 'true');
  assert.throws(() => assertTelemetryTransition(environment, { ...after, PRIVATE_SERVER_CONFIG: 'changed' }, rows, rows, 'true'));
  assert.throws(() => assertTelemetryTransition(environment, { ...after, EXTRA: 'x' }, rows, rows, 'true'));
  assert.throws(() =>
    assertTelemetryTransition(
      environment,
      after,
      rows,
      rows.map((row, i) => (i ? row : { ...row, updatedAt: 2 })),
      'true',
    ),
  );
});

test('generated OIDC value can rotate only when absent from both all-scope owner inventories', () => {
  for (const desired of ['true', 'false']) {
    const before = {
      ...environment,
      VITE_PRODUCT_TELEMETRY_ENABLED: desired === 'true' ? 'false' : 'true',
      VERCEL_OIDC_TOKEN: 'synthetic-generated-before',
    };
    const after = { ...before, VITE_PRODUCT_TELEMETRY_ENABLED: desired, VERCEL_OIDC_TOKEN: 'synthetic-generated-after' };
    assertTelemetryTransition(before, after, rows, rows, desired);
  }
  assertTelemetryTransition(environment, { ...environment, VITE_PRODUCT_TELEMETRY_ENABLED: 'true' }, rows, rows, 'true');
});

for (const target of [['production'], ['preview'], ['development'], []]) {
  for (const side of ['before', 'after', 'both']) {
    test(`project-owned OIDC ${JSON.stringify(target)} in ${side} inventory keeps strict value comparison`, () => {
      const oidc = {
        id: 'configured-oidc',
        key: 'VERCEL_OIDC_TOKEN',
        value: 'synthetic-owner-value',
        type: 'encrypted',
        target,
        customEnvironmentIds: target.length ? [] : ['custom'],
      };
      const beforeRows = side === 'after' ? rows : [...rows, oidc];
      const afterRows = side === 'before' ? rows : [...rows, oidc];
      const before = { ...environment, VERCEL_OIDC_TOKEN: 'synthetic-generated-before' };
      const after = { ...before, VITE_PRODUCT_TELEMETRY_ENABLED: 'true', VERCEL_OIDC_TOKEN: 'synthetic-generated-after' };
      assert.throws(() => assertTelemetryTransition(before, after, beforeRows, afterRows, 'true'));
      if (side === 'both') {
        assertTelemetryTransition(before, { ...after, VERCEL_OIDC_TOKEN: before.VERCEL_OIDC_TOKEN }, beforeRows, afterRows, 'true');
      } else {
        assert.throws(() =>
          assertTelemetryTransition(before, { ...after, VERCEL_OIDC_TOKEN: before.VERCEL_OIDC_TOKEN }, beforeRows, afterRows, 'true'),
        );
      } // Full owner inventories may no longer add/remove rows.
    });
  }
}

test('OIDC effective key presence cannot change even without owner rows', () => {
  const before = { ...environment, VERCEL_OIDC_TOKEN: 'synthetic-generated-before' };
  const after = { ...environment, VITE_PRODUCT_TELEMETRY_ENABLED: 'true' };
  assert.throws(() => assertTelemetryTransition(before, after, rows, rows, 'true'));
  assert.throws(() =>
    assertTelemetryTransition(environment, { ...after, VERCEL_OIDC_TOKEN: 'synthetic-generated-after' }, rows, rows, 'true'),
  );
});

test('OIDC exemption cannot accept empty or non-string replacement values', () => {
  const before = { ...environment, VERCEL_OIDC_TOKEN: 'synthetic-generated-before' };
  for (const value of ['', null, undefined, 0, false, {}]) {
    assert.throws(() =>
      assertTelemetryTransition(
        before,
        { ...before, VITE_PRODUCT_TELEMETRY_ENABLED: 'true', VERCEL_OIDC_TOKEN: value },
        rows,
        rows,
        'true',
      ),
    );
  }
});

test('generated OIDC rotation does not mask unrelated values, backend owner metadata, or desired flag drift', () => {
  const before = { ...environment, VERCEL_OIDC_TOKEN: 'synthetic-generated-before' };
  const after = { ...before, VITE_PRODUCT_TELEMETRY_ENABLED: 'true', VERCEL_OIDC_TOKEN: 'synthetic-generated-after' };
  for (const change of [{ PRIVATE_SERVER_CONFIG: 'changed' }, { SUPABASE_URL: url + '/' }, { VITE_PRODUCT_TELEMETRY_ENABLED: 'false' }]) {
    assert.throws(() => assertTelemetryTransition(before, { ...after, ...change }, rows, rows, 'true'));
  }
  assert.throws(() =>
    assertTelemetryTransition(
      before,
      after,
      rows,
      rows.map((row, i) => (i ? row : { ...row, updatedAt: 2 })),
      'true',
    ),
  );
});

test('missing owner inventories cannot qualify a generated OIDC exemption', () => {
  const before = { ...environment, VERCEL_OIDC_TOKEN: 'synthetic-generated-before' };
  const after = { ...before, VITE_PRODUCT_TELEMETRY_ENABLED: 'true', VERCEL_OIDC_TOKEN: 'synthetic-generated-after' };
  for (const inventory of [undefined, null, {}]) {
    assert.throws(() => assertTelemetryTransition(before, after, inventory, rows, 'true'));
    assert.throws(() => assertTelemetryTransition(before, after, rows, inventory, 'true'));
  }
});
test('inspect evidence exposes only approved flags, identities and digests', () => {
  const record = telemetryInspection({ sha, tree, id: 123 }, previous, previous, environment, flag, rows);
  assert.equal(record.customAliasId, previous.id);
  assert.equal(record.operatorAcceptance, 'NOT_ATTESTED_BY_INSPECT');
  const output = JSON.stringify(record);
  assert.ok(!output.includes(key) && !output.includes(environment.PRIVATE_SERVER_CONFIG));
  assert.equal(flagEvidence(flag).value, 'false');
});

function harness(failure) {
  let row = { ...flag };
  let alias = previous.id;
  let writes = 0;
  const record = {};
  const actions = {
    assertCurrent: async () => {
      if (failure === 'stale-ci') {
        throw new Error('stale');
      }
    },
    assertPreviousAlias: async () => assert.equal(alias, previous.id),
    readFlag: async () => ({ ...row }),
    update: async (id, value) => {
      assert.equal(id, flag.id);
      writes++;
      row = { ...row, value, updatedAt: row.updatedAt + 1 };
      if (failure === 'lost-update' && writes === 1) {
        throw new Error('ambiguous');
      }
      if (failure === 'wrong-response' && writes === 1) {
        return { ...row, value: 'foreign' };
      }
      return { ...row };
    },
    save: async () => {},
  };
  const release = async () => {
    if (failure === 'third-party-alias') {
      alias = 'dpl_foreign';
      throw new Error('alias changed');
    }
    if (failure === 'foreign-row') {
      row = { ...row, value: 'false', updatedAt: 99 };
      throw new Error('row changed');
    }
    if (failure === 'candidate') {
      throw new Error('candidate failed; previous alias active');
    }
    record.status = 'promoted-and-verified';
  };
  return { run: () => changeTelemetryFlag(flag, 'true', actions, release, record), record, state: () => ({ row, writes }) };
}
test('success changes exactly the flag once', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.state().writes, 1);
  assert.equal(h.state().row.value, 'true');
  assert.equal(h.record.status, 'promoted-and-verified');
});
test('candidate failure restores prior flag only after previous alias is proven', async () => {
  const h = harness('candidate');
  await assert.rejects(h.run());
  assert.equal(h.state().writes, 2);
  assert.equal(h.state().row.value, 'false');
  assert.equal(h.record.telemetryCompensation, 'previous-value-restored-and-verified');
});
for (const failure of ['lost-update', 'wrong-response', 'third-party-alias', 'foreign-row']) {
  test(`${failure} refuses compensation and retains operator reinspection`, async () => {
    const h = harness(failure);
    await assert.rejects(h.run());
    assert.equal(h.state().writes, 1);
    assert.equal(h.record.telemetryCompensation, 'refused-or-ambiguous-operator-reinspection-required');
  });
}
test('stale CI cannot mutate or compensate the flag', async () => {
  const h = harness('stale-ci');
  await assert.rejects(h.run());
  assert.equal(h.state().writes, 0);
});
test('workflow keeps push-CI publication and manual main-only shared concurrency', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');
  assert.ok(workflow.includes('workflow_run:') && workflow.includes('workflow_dispatch:'));
  assert.ok(workflow.includes("github.event.workflow_run.event == 'push'"));
  assert.ok(workflow.includes('inputs.sha == github.sha'));
  assert.ok(workflow.includes("github.event.workflow_run.head_branch || 'main'"));
  assert.ok(workflow.includes('ref: ${{ github.event.workflow_run.head_sha }}'));
  assert.ok(workflow.includes('options: [inspect, enable, disable, signup-enable, signup-disable]'));
});

test('emergency disable changes true to false without backend enable attestations', async () => {
  const before = { ...flag, value: 'true' };
  let current = { ...before };
  let writes = 0;
  const actions = {
    assertCurrent: async () => {},
    assertPreviousAlias: async () => {},
    readFlag: async () => current,
    update: async (id, value) => {
      writes++;
      current = { ...current, value, updatedAt: 2 };
      return current;
    },
    save: async () => {},
  };
  await changeTelemetryFlag(before, 'false', actions, async () => {}, {});
  assert.equal(writes, 1);
  assert.equal(current.value, 'false');
});

test('optional operator evidence cannot serialize arbitrary receipt values', () => {
  assert.throws(() => dispatch({ ...baseInput, backend_receipt_sha256: 'not-a-digest' }));
  assert.throws(() => assertTelemetryEnvironment({ ...environment, PRODUCT_TELEMETRY_ENABLED: 'not-a-flag' }, rows, previous, previous.id));
});

for (const foreign of [false, true]) {
  test(`real promotion compensation ${foreign ? 'preserves a foreign alias and flag' : 'restores previous VPS alias before flag'}`, async () => {
    const old = { ...previous, projectId: 'project', readyState: 'READY' };
    const candidate = {
      id: 'dpl_candidate',
      url: 'candidate.vercel.app',
      projectId: 'project',
      readyState: 'READY',
      meta: { sourceSha: sha, backendUrl: url },
    };
    let alias = old;
    let row = { ...flag };
    const sequence = [];
    const actions = {
      assertCurrent: async () => {},
      assertPreviousAlias: async () => assert.equal(alias.id, old.id),
      readFlag: async () => row,
      update: async (id, value) => {
        sequence.push('flag:' + value);
        row = { ...row, value, updatedAt: row.updatedAt + 1 };
        return row;
      },
      save: async () => {},
    };
    const release = () =>
      promoteVerified(
        { candidate, previous: old, sha, projectId: 'project' },
        {
          smoke: async () => {},
          assertCurrent: async () => {},
          inspectAlias: async () => alias,
          promote: async (deployment) => {
            sequence.push('alias:' + deployment.id);
            alias = deployment;
          },
          verifyAlias: async (deployment) => {
            if (deployment.id === candidate.id) {
              if (foreign) {
                alias = { ...old, id: 'dpl_foreign' };
              }
              throw new Error('verify failed');
            }
            assert.equal(alias.id, old.id);
          },
        },
      );
    const record = {};
    await assert.rejects(changeTelemetryFlag(flag, 'true', actions, release, record));
    assert.equal(alias.id, foreign ? 'dpl_foreign' : old.id);
    assert.equal(row.value, foreign ? 'true' : 'false');
    assert.deepEqual(
      sequence,
      foreign ? ['flag:true', 'alias:dpl_candidate'] : ['flag:true', 'alias:dpl_candidate', 'alias:dpl_previous', 'flag:false'],
    );
  });
}

test('runner suppresses private assertion/provider error details', () => {
  const runner = readFileSync(resolve(process.cwd(), 'scripts/ci/deploy.mjs'), 'utf8');
  assert.ok(runner.includes('await main();'));
  assert.ok(
    runner.includes("console.error('Verified deployment failed; private details withheld. Inspect sanitized deployment-evidence.')"),
  );
  assert.ok(!runner.includes('console.error(error)'));
});

const signup = { ...flag, id: 'signup-id', key: signupKey };
const enabledTelemetry = { ...flag, value: 'true' };
const signupRows = [
  ...rows,
  enabledTelemetry,
  signup,
  { id: 'private-id', key: 'PRIVATE_SERVER_CONFIG', value: '[SENSITIVE]', type: 'encrypted', target: ['production'], updatedAt: 1 },
];
const signupEnvironment = { ...environment, VITE_PRODUCT_TELEMETRY_ENABLED: 'true' };
for (const mode of ['signup-enable', 'signup-disable']) {
  test(mode + ' requires Root signup acceptance and fresh backup bindings', () => {
    const input = {
      ...baseInput,
      mode,
      signup_backend_accepted: true,
      post_open_backup_accepted: true,
      backend_receipt_sha256: 'c'.repeat(64),
      backup_receipt_sha256: 'd'.repeat(64),
    };
    assert.equal(dispatch(input).telemetry.mode, mode);
    for (const field of ['signup_backend_accepted', 'post_open_backup_accepted', 'backend_receipt_sha256', 'backup_receipt_sha256']) {
      assert.throws(() => dispatch({ ...input, [field]: '' }));
    }
  });
}
test('signup existing dedicated readable owner and effective telemetry true are mandatory', async () => {
  assert.equal(signupFlag(signupRows).id, signup.id);
  assertSignupEnvironment(signupEnvironment, signupRows, previous, previous.id);
  for (const change of [
    { target: ['production', 'preview'] },
    { gitBranch: 'main' },
    { configurationId: 'integration' },
    { system: true },
    { customEnvironmentIds: ['custom'] },
    { visibility: 'secret' },
    { updatedAt: undefined },
    { value: '[SENSITIVE]' },
  ]) {
    assert.throws(() => signupFlag([{ ...signup, ...change }]));
  }
  assert.throws(() => signupFlag([]));
  assert.throws(() => signupFlag([signup, signup]));
  assert.throws(() =>
    assertSignupEnvironment({ ...signupEnvironment, VITE_PRODUCT_TELEMETRY_ENABLED: 'false' }, signupRows, previous, previous.id),
  );
  assert.throws(() =>
    assertSignupEnvironment(
      signupEnvironment,
      signupRows.map((r) => (r.id === flag.id ? { ...r, value: 'false' } : r)),
      previous,
      previous.id,
    ),
  );
  const listed = { ...signup, type: 'encrypted', value: 'ciphertext' };
  assert.deepEqual(
    await readableSignupFlag([listed], async () => ({
      ...listed,
      decrypted: true,
      value: 'false',
      system: false,
      configurationId: null,
      customEnvironmentIds: [],
    })),
    { ...listed, value: 'false', decrypted: true },
  );
});
test('signup transition preserves telemetry/every other effective value and complete owner inventory', () => {
  const after = { ...signupEnvironment, VITE_ENABLE_SIGNUP: 'true', VERCEL_OIDC_TOKEN: 'new-generated' };
  const before = { ...signupEnvironment, VERCEL_OIDC_TOKEN: 'old-generated' };
  const updated = signupRows.map((r) => (r.id === signup.id ? { ...r, value: 'true', updatedAt: 2 } : r));
  assertTelemetryTransition(before, after, signupRows, updated, 'true', signupKey);
  for (const changed of [
    { ...after, VITE_PRODUCT_TELEMETRY_ENABLED: 'false' },
    { ...after, PRIVATE_SERVER_CONFIG: 'other' },
  ]) {
    assert.throws(() => assertTelemetryTransition(before, changed, signupRows, updated, 'true', signupKey));
  }
  for (const changed of [
    updated.filter((r) => r.id !== 'private-id'),
    [...updated, { ...signupRows[3], id: 'new-private' }],
    updated.map((r) => (r.id === 'private-id' ? { ...r, updatedAt: 2 } : r)),
    updated.map((r) => (r.id === 'private-id' ? { ...r, value: 'new-ciphertext' } : r)),
  ]) {
    assert.throws(() => assertTelemetryTransition(before, after, signupRows, changed, 'true', signupKey));
  }
  const ownerOidc = { id: 'oidc', key: 'VERCEL_OIDC_TOKEN', value: '[SENSITIVE]', target: ['preview'] };
  assert.throws(() => assertTelemetryTransition(before, after, [...signupRows, ownerOidc], [...updated, ownerOidc], 'true', signupKey));
  assert.throws(() => assertTelemetryTransition(before, { ...after, VERCEL_OIDC_TOKEN: '' }, signupRows, updated, 'true', signupKey));
});
test('telemetry emergency disable remains valid while signup is true and preserves it', async () => {
  const env = { ...signupEnvironment, VITE_ENABLE_SIGNUP: 'true' };
  const own = signupRows.map((r) => (r.id === signup.id ? { ...r, value: 'true' } : r));
  assertTelemetryEnvironment(env, own, previous, previous.id);
  let row = { ...enabledTelemetry };
  await changeTelemetryFlag(
    row,
    'false',
    {
      assertCurrent: async () => {},
      assertPreviousAlias: async () => {},
      readFlag: async () => row,
      update: async (id, value) => (row = { ...row, value, updatedAt: 2 }),
      save: async () => {},
    },
    async () =>
      assertTelemetryTransition(
        env,
        { ...env, VITE_PRODUCT_TELEMETRY_ENABLED: 'false' },
        own,
        own.map((r) => (r.id === flag.id ? row : r)),
        'false',
      ),
    {},
  );
  assert.equal(row.value, 'false');
  assert.throws(() =>
    assertTelemetryTransition(env, { ...env, VITE_ENABLE_SIGNUP: 'false', VITE_PRODUCT_TELEMETRY_ENABLED: 'false' }, own, own, 'false'),
  );
});
function signupFlow(failure) {
  let row = { ...signup },
    writes = 0,
    alias = previous.id;
  const record = {};
  const inventory = () => signupRows.map((r) => (r.id === signup.id ? row : r));
  const actions = {
    assertCurrent: async () => assertOwnerInventory(signupRows, inventory(), signupKey),
    assertPreviousAlias: async () => assert.equal(alias, previous.id),
    readFlag: async () => ({ ...row }),
    update: async (id, value) => {
      assert.equal(id, signup.id);
      writes++;
      row = { ...row, value, updatedAt: row.updatedAt + 1 };
      if (failure === 'ambiguous' && writes === 1) {
        throw Error('lost');
      }
      return { ...row };
    },
    save: async () => {},
  };
  const release = async (after) => {
    assertTelemetryTransition(
      signupEnvironment,
      { ...signupEnvironment, VITE_ENABLE_SIGNUP: 'true' },
      signupRows,
      inventory(),
      'true',
      signupKey,
    );
    if (failure === 'foreign-owner') {
      row = { ...row, updatedAt: 99 };
      throw Error('foreign');
    }
    if (failure === 'candidate') {
      throw Error('candidate');
    }
    if (failure === 'signup-drift-before-promotion') {
      row = { ...row, value: 'false', updatedAt: 99 };
      assertOwnerInventory(signupRows, inventory(), signupKey, after);
    }
    if (failure === 'foreign-alias') {
      alias = 'dpl_foreign';
      throw Error('foreign');
    }
    record.status = 'promoted-and-verified';
  };
  return { run: () => changeSignupFlag(signup, 'true', actions, release, record), record, state: () => ({ row, writes }) };
}
for (const failure of [undefined, 'candidate', 'ambiguous', 'foreign-owner', 'signup-drift-before-promotion', 'foreign-alias']) {
  test('real selected signup row flow ' + (failure || 'success'), async () => {
    const h = signupFlow(failure);
    if (failure) {
      await assert.rejects(h.run());
    } else {
      await h.run();
    }
    assert.equal(h.state().writes, failure === 'candidate' ? 2 : 1);
    assert.equal(h.state().row.key, signupKey);
    if (failure === 'candidate') {
      assert.equal(h.record.signupCompensation, 'previous-value-restored-and-verified');
    }
    if (failure && failure !== 'candidate') {
      assert.equal(h.record.signupCompensation, 'refused-or-ambiguous-operator-reinspection-required');
    }
    if (!failure) {
      assert.equal(h.record.status, 'promoted-and-verified');
    }
  });
}
test('runner binds signup metadata/receipt and full inventory again before candidate promotion', () => {
  const runner = readFileSync(resolve(process.cwd(), 'scripts/ci/deploy.mjs'), 'utf8');
  assert.ok(runner.includes('candidate.meta?.signupEnabled'));
  assert.ok(runner.includes('assertOwnerInventory(baseline.rows, current.rows, operation.key, expectedFlag)'));
  assert.ok(runner.includes('operation.signup ? changeSignupFlag : changeTelemetryFlag'));
});

for (const foreign of [false, true]) {
  test('signup actual promoteVerified compensation ' + (foreign ? 'refuses foreign alias' : 'restores VPS alias then signup'), async () => {
    const old = { ...previous, projectId: 'project', readyState: 'READY' };
    const candidate = {
      id: 'dpl_candidate',
      url: 'candidate.vercel.app',
      projectId: 'project',
      readyState: 'READY',
      meta: { sourceSha: sha, backendUrl: url, signupEnabled: 'true', telemetryEnabled: 'true' },
    };
    let alias = old,
      row = { ...signup };
    const calls = [];
    const record = {};
    const actions = {
      assertCurrent: async () => {},
      assertPreviousAlias: async () => assert.equal(alias.id, old.id),
      readFlag: async () => row,
      update: async (id, value) => {
        assert.equal(id, signup.id);
        calls.push('signup:' + value);
        return (row = { ...row, value, updatedAt: row.updatedAt + 1 });
      },
      save: async () => {},
    };
    await assert.rejects(
      changeSignupFlag(
        signup,
        'true',
        actions,
        (after) =>
          promoteVerified(
            { candidate, previous: old, sha, projectId: 'project' },
            {
              smoke: async () => {},
              assertCurrent: async () =>
                assertOwnerInventory(
                  signupRows,
                  signupRows.map((r) => (r.id === signup.id ? row : r)),
                  signupKey,
                  after,
                ),
              inspectAlias: async () => alias,
              promote: async (d) => {
                calls.push('alias:' + d.id);
                alias = d;
              },
              verifyAlias: async (d) => {
                if (d.id === candidate.id) {
                  if (foreign) {
                    alias = { ...old, id: 'dpl_foreign' };
                  }
                  throw Error('verify');
                }
                assert.equal(alias.id, old.id);
              },
            },
          ),
        record,
      ),
    );
    assert.deepEqual(
      calls,
      foreign ? ['signup:true', 'alias:dpl_candidate'] : ['signup:true', 'alias:dpl_candidate', 'alias:dpl_previous', 'signup:false'],
    );
    assert.equal(
      record.signupCompensation,
      foreign ? 'refused-or-ambiguous-operator-reinspection-required' : 'previous-value-restored-and-verified',
    );
  });
}
