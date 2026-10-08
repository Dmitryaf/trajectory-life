import assert from 'node:assert/strict';
import { backendKeys, digest, productionRows, sameProductionMetadata, sameRow, targetUrl } from './cutover-policy.mjs';

export const telemetryKey = 'VITE_PRODUCT_TELEMETRY_ENABLED';
export const signupKey = 'VITE_ENABLE_SIGNUP';
export function releaseOperation(mode) {
  assert.ok(['inspect', 'enable', 'disable', 'signup-enable', 'signup-disable'].includes(mode));
  const signup = mode.startsWith('signup-');
  return { key: signup ? signupKey : telemetryKey, signup, desired: mode.endsWith('enable') ? 'true' : 'false' };
}
export const customProductionAlias = 'trajectory-life.ru';

export function releaseSource(event, eventName, ref, sha, tree) {
  if (eventName === 'workflow_run') {
    assert.ok(event.workflow_run, 'Missing push CI event');
    return event.workflow_run;
  }
  assert.equal(eventName, 'workflow_dispatch', 'Unsupported publication event');
  assert.equal(ref, 'refs/heads/main', 'Telemetry dispatch must use main');
  const input = event.inputs || {};
  assert.ok(['inspect', 'enable', 'disable', 'signup-enable', 'signup-disable'].includes(input.mode), 'Unsupported telemetry operation');
  assert.match(input.sha || '', /^[a-f0-9]{40}$/);
  assert.match(input.tree || '', /^[a-f0-9]{40}$/);
  assert.equal(input.sha, sha, 'Dispatch source differs from checkout');
  assert.equal(input.tree, tree, 'Dispatch tree differs from checkout');
  assert.match(input.ci_run || '', /^[1-9][0-9]*$/);
  assert.ok(Number.isSafeInteger(Number(input.ci_run)), 'Invalid CI run');
  assert.match(input.previous_id || '', /^dpl_[A-Za-z0-9]+$/);
  for (const name of ['backend_receipt_sha256', 'backup_receipt_sha256']) {
    if (input[name]) {
      assert.match(input[name], /^[a-f0-9]{64}$/, 'Only receipt digests may enter public evidence');
    }
  }
  if (input.mode === 'enable') {
    for (const key of ['backend_accepted', 'post_open_backup_accepted']) {
      assert.ok(input[key] === true || input[key] === 'true', 'Root must accept backend telemetry and post-opening backup');
    }
    for (const key of ['backend_receipt_sha256', 'backup_receipt_sha256']) {
      assert.match(input[key] || '', /^[a-f0-9]{64}$/, 'Root must bind its private acceptance receipts');
    }
  }
  if (input.mode.startsWith('signup-')) {
    for (const key of ['signup_backend_accepted', 'post_open_backup_accepted']) {
      assert.ok(input[key] === true || input[key] === 'true', 'Root must accept backend signup and a fresh backup');
    }
    for (const key of ['backend_receipt_sha256', 'backup_receipt_sha256']) {
      assert.match(input[key] || '', /^[a-f0-9]{64}$/, 'Root must bind signup acceptance and fresh backup receipts');
    }
  }
  return { id: Number(input.ci_run), head_branch: 'main', telemetry: input };
}

export function telemetryFlag(rows, readable = true) {
  return releaseFlag(rows, telemetryKey, readable);
}
export function signupFlag(rows, readable = true) {
  return releaseFlag(rows, signupKey, readable);
}
function releaseFlag(rows, key, readable = true) {
  assert.ok([telemetryKey, signupKey].includes(key));
  assert.ok(Array.isArray(rows));
  const matches = rows.filter((row) => row.key === key && row.target?.includes('production'));
  assert.equal(matches.length, 1, 'One existing production telemetry flag is required');
  const row = matches[0];
  assert.deepEqual(row.target, ['production'], 'Telemetry flag cannot share Preview scope');
  assert.ok(
    (row.gitBranch === undefined || row.gitBranch === '') &&
      (row.configurationId === undefined || row.configurationId === null || row.configurationId === '') &&
      (row.system === undefined || row.system === false) &&
      (row.customEnvironmentIds === undefined || (Array.isArray(row.customEnvironmentIds) && row.customEnvironmentIds.length === 0)),
    'Managed or branch-scoped telemetry flag is unsupported',
  );
  assert.ok(['plain', 'encrypted'].includes(row.type) && row.visibility !== 'secret', 'Telemetry flag must be readable Config');
  assert.ok(
    typeof row.id === 'string' && row.id && Number.isSafeInteger(row.updatedAt) && row.updatedAt >= 0,
    'Telemetry row identity/timestamp is required',
  );
  assert.ok(typeof row.value === 'string' && !row.value.includes('[SENSITIVE]'), 'Telemetry value is unreadable');
  if (readable) {
    assert.ok(['false', 'true'].includes(row.value), 'Telemetry flag must have an explicit boolean value');
  }
  return row;
}

export async function readableTelemetryFlag(rows, readById) {
  return readableReleaseFlag(rows, readById, telemetryKey);
}
export async function readableSignupFlag(rows, readById) {
  return readableReleaseFlag(rows, readById, signupKey);
}
async function readableReleaseFlag(rows, readById, key) {
  const row = releaseFlag(rows, key, false);
  if (row.type === 'plain' || row.decrypted === true) {
    return releaseFlag([row], key);
  }
  const actual = await readById(row.id);
  assert.equal(actual?.decrypted, true, 'Telemetry flag was not decrypted');
  releaseFlag([actual], key);
  assert.ok(sameProductionMetadata(row, actual), 'Telemetry metadata changed during decryption');
  return { ...row, value: actual.value, decrypted: true };
}

export function assertTelemetryEnvironment(environment, rows, previous, expectedPreviousId) {
  assert.equal(previous.id, expectedPreviousId, 'Production deployment changed');
  assert.equal(previous.meta?.backendUrl, targetUrl, 'Only an already published VPS frontend may change telemetry');
  const selected = productionRows(rows);
  for (const { key, row } of selected) {
    assert.ok(row, 'All four dedicated backend rows are required');
    assert.equal(environment[key], row.value, 'Effective backend differs from its owner row');
    if (key.endsWith('_URL')) {
      assert.equal(row.value, targetUrl, 'Backend URL must be exact VPS bytes');
    } else {
      assert.match(row.value, /^sb_publishable_[A-Za-z0-9_-]+$/, 'Only a public VPS key is supported');
    }
  }
  assert.equal(environment.VITE_SUPABASE_ANON_KEY, environment.SUPABASE_ANON_KEY, 'Browser/server public key differs');
  assert.equal(environment.VITE_REQUIRE_AUTH, 'true');
  assert.ok(['false', 'true'].includes(environment.VITE_ENABLE_SIGNUP), 'Signup must be an explicit boolean');
  assert.ok(
    [undefined, 'false', 'true'].includes(environment.PRODUCT_TELEMETRY_ENABLED),
    'Server telemetry declaration must be a boolean flag',
  );
}

export function assertSignupEnvironment(environment, rows, previous, expectedPreviousId) {
  assertTelemetryEnvironment(environment, rows, previous, expectedPreviousId);
  assert.equal(environment[telemetryKey], 'true', 'Signup release must preserve enabled telemetry');
  assert.equal(telemetryFlag(rows).value, 'true', 'Telemetry owner must remain enabled');
  assert.equal(signupFlag(rows).value, environment[signupKey], 'Effective signup differs from its dedicated owner');
}

// Compare the entire LIST representation, including unrelated masked secrets,
// without decrypting them or claiming their effective plaintext was observed.
function ownerRepresentation(row) {
  const sort = (value) => {
    if (Array.isArray(value)) {
      return value.map(sort);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, sort(value[key])]),
      );
    }
    return value;
  };
  return JSON.stringify(sort(row));
}
export function assertOwnerInventory(beforeRows, afterRows, mutableKey, expected) {
  assert.ok([telemetryKey, signupKey].includes(mutableKey));
  assert.ok(Array.isArray(beforeRows) && Array.isArray(afterRows), 'Complete owner inventories are required');
  const index = (rows) => {
    assert.ok(rows.every((row) => typeof row.id === 'string' && row.id));
    const map = new Map(rows.map((row) => [row.id, row]));
    assert.equal(map.size, rows.length, 'Duplicate owner row IDs');
    return map;
  };
  const before = index(beforeRows),
    after = index(afterRows);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'Owner inventory IDs changed');
  for (const [id, row] of before) {
    const actual = after.get(id);
    const selected = row.key === mutableKey && row.target?.includes('production');
    if (selected) {
      assert.equal(actual.key, row.key);
      if (expected) {
        assert.equal(expected.id, id);
        assert.ok(sameRow(actual, expected), 'Selected owner changed before promotion');
      }
    } else {
      assert.equal(ownerRepresentation(actual), ownerRepresentation(row), 'Unrelated owner representation changed');
    }
  }
}

export function assertTelemetryTransition(beforeEnvironment, afterEnvironment, beforeRows, afterRows, desired, mutableKey = telemetryKey) {
  assertOwnerInventory(beforeRows, afterRows, mutableKey);
  assert.deepEqual(Object.keys(afterEnvironment).sort(), Object.keys(beforeEnvironment).sort(), 'Effective config keys changed');
  assert.ok(Array.isArray(beforeRows) && Array.isArray(afterRows), 'Complete owner inventories are required');
  // A generated provider OIDC token may rotate between pulls. A project-owned
  // row in ANY scope disables this exception; presence/key sets remain exact.
  const generatedOidc = ![...beforeRows, ...afterRows].some((row) => row.key === 'VERCEL_OIDC_TOKEN');
  for (const [key, value] of Object.entries(beforeEnvironment)) {
    if (
      key === 'VERCEL_OIDC_TOKEN' &&
      generatedOidc &&
      typeof value === 'string' &&
      value.length > 0 &&
      typeof afterEnvironment[key] === 'string' &&
      afterEnvironment[key].length > 0
    ) {
      continue;
    }
    assert.equal(afterEnvironment[key], key === mutableKey ? desired : value, 'An unrelated effective parameter changed');
  }
  for (const key of backendKeys) {
    const before = productionRows(beforeRows).find((entry) => entry.key === key).row;
    const after = productionRows(afterRows).find((entry) => entry.key === key).row;
    assert.ok(sameRow(before, after), 'Backend owner metadata changed during telemetry release');
  }
}

export function flagEvidence(row) {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    type: row.type,
    visibility: row.visibility,
    target: row.target,
    updatedAt: row.updatedAt,
  };
}

// Vercel has no atomic row CAS. Shared deploy-main concurrency and exact owner
// checks protect our writes; ambiguous responses never authorize compensation.
export async function changeTelemetryFlag(before, desired, actions, release, record) {
  assert.equal(before.key, telemetryKey);
  return changeReleaseFlag(before, desired, actions, release, record, 'telemetry');
}
export async function changeSignupFlag(before, desired, actions, release, record) {
  assert.equal(before.key, signupKey);
  return changeReleaseFlag(before, desired, actions, release, record, 'signup');
}
async function changeReleaseFlag(before, desired, actions, release, record, kind) {
  let after;
  let mutationAttempted = false;
  try {
    assert.ok(['true', 'false'].includes(desired));
    assert.notEqual(before.value, desired, 'Telemetry flag is already at the requested value');
    await actions.assertCurrent();
    assert.ok(sameRow(await actions.readFlag(), before), 'Telemetry flag changed before update');
    record[kind + 'Mutation'] = 'attempted';
    mutationAttempted = true;
    await actions.save(record);
    const returned = await actions.update(before.id, desired);
    assert.equal(returned?.id, before.id, 'Telemetry update returned no matching owner ID');
    const observed = await actions.readFlag();
    assert.equal(observed.value, desired);
    assert.equal(returned.value, desired, 'Telemetry response must bind the written value');
    assert.ok(sameProductionMetadata(returned, observed), 'Telemetry response/owner metadata mismatch');
    assert.ok(
      observed.updatedAt >= before.updatedAt && sameRow({ ...before, value: desired, updatedAt: observed.updatedAt }, observed),
      'Telemetry owner metadata changed during update',
    );
    after = observed;
    record[kind + 'Mutation'] = 'verified';
    record[kind + 'After'] = flagEvidence(after);
    await actions.save(record);
    return await release(after);
  } catch (error) {
    record[kind + 'Compensation'] = 'not-needed';
    if (mutationAttempted) {
      try {
        await actions.assertPreviousAlias();
        const current = await actions.readFlag();
        if (!sameRow(current, before)) {
          assert.ok(after && sameRow(current, after), 'Ambiguous or foreign telemetry change requires operator inspection');
          const returned = await actions.update(after.id, before.value);
          assert.equal(returned?.id, before.id);
          assert.equal(returned.value, before.value);
          const restored = await actions.readFlag();
          assert.ok(sameProductionMetadata(returned, restored), 'Compensation response/owner metadata mismatch');
          assert.ok(
            restored.updatedAt >= after.updatedAt && sameRow({ ...before, updatedAt: restored.updatedAt }, restored),
            'Telemetry compensation was not verified',
          );
          record[kind + 'Compensation'] = 'previous-value-restored-and-verified';
        } else {
          record[kind + 'Compensation'] = 'original-row-unchanged';
        }
      } catch {
        record[kind + 'Compensation'] = 'refused-or-ambiguous-operator-reinspection-required';
      }
    }
    record.status = 'failed';
    await actions.save(record);
    throw error;
  }
}

export function telemetryInspection(source, previous, custom, environment, flag, rows) {
  return {
    status: 'telemetry-read-only-inspected',
    sha: source.sha,
    tree: source.tree,
    ciRun: source.id,
    checkedAtUtc: new Date().toISOString(),
    canonicalAlias: 'trajectory-app-lilac.vercel.app',
    customAlias: customProductionAlias,
    previous: { id: previous.id, url: previous.url },
    customAliasId: custom.id,
    backendUrl: targetUrl,
    publicKeySha256: digest(environment.VITE_SUPABASE_ANON_KEY),
    requireAuth: environment.VITE_REQUIRE_AUTH,
    signupEnabled: environment.VITE_ENABLE_SIGNUP,
    frontendTelemetryEnabled: environment[telemetryKey],
    vercelServerTelemetryFlag: environment.PRODUCT_TELEMETRY_ENABLED ?? null,
    telemetryBefore: flagEvidence(flag),
    backendRowIds: productionRows(rows).map(({ key, row }) => ({ key, id: row.id })),
    operatorAcceptance: 'NOT_ATTESTED_BY_INSPECT',
    sourceReturnAllowed: false,
  };
}
