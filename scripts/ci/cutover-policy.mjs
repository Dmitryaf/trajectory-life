import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { assertClientBuildEnvironment } from './build-environment.mjs';
import { releaseTargets } from './release-policy.mjs';

export const backendKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
export const targetUrl = releaseTargets.main.selfHostedUrl;
export const hostedUrl = `https://${releaseTargets.main.projectRef}.supabase.co`;
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function assertBackendAlignment(environment, target, previous) {
  assertClientBuildEnvironment(environment, target);
  const browserUrl = environment.VITE_SUPABASE_URL.trim();
  const browserKey = environment.VITE_SUPABASE_ANON_KEY.trim();
  assert.equal(environment.SUPABASE_URL || browserUrl, browserUrl, 'Server and browser backend URLs differ');
  assert.ok((environment.SUPABASE_ANON_KEY || browserKey) === browserKey, 'Server and browser public keys differ');
  if (previous && browserUrl === target.selfHostedUrl) {
    assert.equal(previous.meta?.backendUrl, target.selfHostedUrl, 'The first VPS publication requires guarded cutover');
  }
  if (previous?.meta?.backendUrl === target.selfHostedUrl && target.selfHostedUrl) {
    assert.equal(browserUrl, target.selfHostedUrl, 'Hosted rollback is forbidden after managed VPS publication');
  }
}

export function cutoverEnvironment(base, key) {
  assert.ok(
    typeof key === 'string' && !/\s/.test(key) && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key),
    'One public VPS key without whitespace is required',
  );
  const result = {
    ...base,
    VITE_SUPABASE_URL: targetUrl,
    VITE_SUPABASE_ANON_KEY: key,
    SUPABASE_URL: targetUrl,
    SUPABASE_ANON_KEY: key,
    VITE_REQUIRE_AUTH: 'true',
    VITE_ENABLE_SIGNUP: 'false',
    VITE_PRODUCT_TELEMETRY_ENABLED: 'false',
    PRODUCT_TELEMETRY_ENABLED: 'false',
  };
  assertBackendAlignment(result, releaseTargets.main);
  return result;
}

// Metadata is an operator marker, not proof of the deployed client or backend.
export function assertCandidate(candidate, sha, ciRun, previousId, key) {
  assert.equal(candidate.meta?.sourceSha, sha);
  assert.equal(candidate.meta?.ciRun, String(ciRun));
  assert.equal(candidate.meta?.cutover, 'vps-candidate');
  assert.equal(candidate.meta?.backendUrl, targetUrl);
  assert.equal(candidate.meta?.previousDeployment, previousId);
  assert.equal(candidate.meta?.publicKeySha256, digest(key));
}

export function productionRows(rows) {
  assert.ok(Array.isArray(rows), 'Unexpected environment response');
  return backendKeys.map((key) => {
    const matching = rows.filter((row) => row.key === key && row.target?.includes('production'));
    assert.ok(matching.length <= 1, 'Duplicate production backend parameter');
    const row = matching[0] || null;
    if (row) {
      assert.deepEqual(row.target, ['production'], 'Shared production/preview backend parameter requires separate operator preparation');
      assert.ok(
        !row.gitBranch && !row.configurationId && !row.system && !row.customEnvironmentIds?.length,
        'Managed or branch-scoped backend parameter is unsupported',
      );
      assert.ok(['plain', 'encrypted'].includes(row.type), 'Unreadable backend parameter cannot be compensated');
      assert.ok(
        typeof row.id === 'string' && typeof row.value === 'string' && !row.value.includes('[SENSITIVE]'),
        'Readable original backend parameter is required',
      );
      if (key.startsWith('VITE_')) {
        assert.notEqual(row.visibility, 'secret', 'Public build configuration must be readable');
      }
    }
    return { key, row };
  });
}

export function sameRow(left, right) {
  if (!left || !right) {
    return left === right;
  }
  return (
    ['id', 'key', 'value', 'type', 'visibility', 'updatedAt', 'gitBranch', 'configurationId', 'system'].every(
      (key) => left[key] === right[key],
    ) &&
    JSON.stringify(left.target) === JSON.stringify(right.target) &&
    JSON.stringify(left.customEnvironmentIds || []) === JSON.stringify(right.customEnvironmentIds || [])
  );
}

export function sanitizedRows(rows) {
  assert.ok(Array.isArray(rows), 'Unexpected environment list');
  return backendKeys.map((key) => ({
    key,
    rows: rows
      .filter((row) => row.key === key && row.target?.includes('production'))
      .map((row) => {
        const result = {
          id: row.id,
          type: row.type,
          visibility: row.visibility,
          target: row.target,
          branchScoped: Boolean(row.gitBranch),
          integrationOwned: Boolean(row.configurationId),
          system: Boolean(row.system),
          customEnvironmentIds: row.customEnvironmentIds || [],
        };
        if (key.endsWith('_URL')) {
          if ([hostedUrl, targetUrl].includes(row.value)) {
            result.url = row.value;
          } else {
            result.unexpectedUrl = true;
          }
        } else {
          result.sha256 = digest(typeof row.value === 'string' ? row.value : '');
        }
        return result;
      }),
  }));
}

export async function assertClosedGate(fetchRequest, key, marker) {
  assert.match(marker || '', /^[A-Za-z0-9_-]{1,80}$/);
  for (const path of ['/auth/v1/user', '/rest/v1/trajectory_snapshots?select=user_id&limit=0']) {
    const response = await fetchRequest(`${targetUrl}${path}`, {
      headers: { apikey: key },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 503, 'The target public API gate must remain closed');
    assert.equal(response.headers.get('X-Trajectory-Target-Gate'), marker, 'Target gate marker changed');
    assert.equal(response.headers.get('Retry-After'), '300', 'Target gate retry policy changed');
  }
}

// GitHub concurrency serializes our workflows. These reads are compensating
// ownership checks; Vercel has no atomic compare-and-swap in this endpoint.
// An ambiguous create without a returned ID requires operator intervention.
export async function promoteCutover(input, actions) {
  assert.equal(input.beforeUserWrites, true, 'Promotion is allowed only before user writes');
  const changes = [];
  let original;
  const desired = backendKeys.map((key) => ({ key, value: input.environment[key] }));
  try {
    await actions.assertCurrent();
    await actions.assertGate();
    assert.equal((await actions.inspectAlias()).id, input.previous.id, 'Canonical deployment changed');
    await actions.smoke();
    original = productionRows(await actions.readRows());
    for (const { key, value } of desired) {
      await actions.assertCurrent();
      await actions.assertGate();
      assert.equal((await actions.inspectAlias()).id, input.previous.id, 'Canonical deployment changed before env update');
      const before = original.find((entry) => entry.key === key).row;
      const current = productionRows(await actions.readRows()).find((entry) => entry.key === key).row;
      assert.ok(sameRow(current, before), 'Backend parameter changed before update');
      const change = { key, before, after: null };
      changes.push(change);
      const updated = await actions.putRow(key, value, before);
      change.after = updated;
      const observed = productionRows(await actions.readRows()).find((entry) => entry.key === key).row;
      assert.ok(sameRow(updated, observed), 'Backend parameter changed after update');
    }
    await actions.verifyEnvironment();
    await actions.assertCurrent();
    await actions.assertGate();
    assert.equal((await actions.inspectAlias()).id, input.previous.id, 'Canonical deployment changed before promotion');
    await actions.promote(input.candidate);
    await actions.verifyAlias(input.candidate);
    await actions.assertGate();
  } catch (error) {
    if (changes.length) {
      await actions.assertGate();
      const currentAlias = await actions.inspectAlias();
      assert.ok(
        [input.previous.id, input.candidate.id].includes(currentAlias.id),
        'Another deployment is active; compensation requires the operator',
      );
      if (currentAlias.id === input.candidate.id) {
        await actions.assertGate();
        await actions.promote(input.previous);
        await actions.verifyAlias(input.previous);
      }
      for (const change of [...changes].reverse()) {
        await actions.assertGate();
        assert.equal((await actions.inspectAlias()).id, input.previous.id, 'Canonical deployment changed during compensation');
        const current = productionRows(await actions.readRows()).find((entry) => entry.key === change.key).row;
        if (sameRow(current, change.before)) {
          continue;
        }
        assert.ok(
          change.after && sameRow(current, change.after),
          'Backend parameter is not our exact state; compensation requires the operator',
        );
        await actions.restoreRow(change);
      }
    }
    throw error;
  }
}

export function appendCutoverOverrides(raw, key) {
  const overrides = cutoverEnvironment({}, key);
  const original = parseEnv(raw);
  const suffix = Object.entries(overrides)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
  const result = raw + (raw.endsWith('\n') ? '' : '\n') + suffix + '\n';
  const parsed = parseEnv(result);
  for (const [name, value] of Object.entries(overrides)) {
    assert.ok(parsed[name] === value, 'Effective cutover override differs from the required configuration');
  }
  for (const [name, value] of Object.entries(original)) {
    if (!Object.hasOwn(overrides, name)) {
      assert.ok(parsed[name] === value, 'Unrelated build configuration changed');
    }
  }
  return result;
}
