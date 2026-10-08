// Temporary operator branch only. No deployment, promotion, true flag or Source operation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { backendKeys, digest, productionRows, readableProductionRows, sameProductionMetadata, targetUrl } from './cutover-policy.mjs';
import { assertDeployment, assertReleaseRun, environmentPullArgs, releaseTargets } from './release-policy.mjs';
import { git, writeJson } from './runtime.mjs';

export const pins = Object.freeze({
  branch: 'codex/telemetry-owner-baseline-20261008',
  repository: 'Dmitryaf/trajectory-life',
  sha: '5bc99e65152c23b17f2b0ab42edc7d6fb7f13da6',
  tree: '4d825150804451e2bea4072ca06a75299858894c',
  ciRun: '37702835820',
  candidateId: 'dpl_5NdEYwgLPWAHipCHyZJLq5S43HD9',
  projectId: 'prj_O0neiglfpJG0JKq6jBYLJOE6buR4',
  teamId: 'team_sZTFAJUNjw3uCHNZarBQgdVb',
  canonicalAlias: releaseTargets.main.alias,
  customAlias: 'trajectory-life.ru',
});
export const flagKey = 'VITE_PRODUCT_TELEMETRY_ENABLED';
export const signupKey = 'VITE_ENABLE_SIGNUP';
const operatorModes = ['inspect', 'bootstrap-false', 'bootstrap-signup-false'];
function checkedKey(key) {
  assert.ok([flagKey, signupKey].includes(key));
  return key;
}
function bootstrapKey(mode) {
  assert.ok(operatorModes.includes(mode) && mode !== 'inspect');
  return mode === 'bootstrap-signup-false' ? signupKey : flagKey;
}
export const artifactName = 'telemetry-owner-baseline';
const receiptFile = 'qa/ci/telemetry-owner-baseline.json';

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}
const hashObject = (value) => digest(JSON.stringify(canonical(value)));

export function inventoryHash(rows) {
  assert.ok(Array.isArray(rows) && rows.length <= 1000);
  assert.ok(rows.every((row) => typeof row.id === 'string' && row.id && typeof row.key === 'string'));
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  return hashObject(
    [...rows].sort((a, b) => {
      if (a.id === b.id) {
        return 0;
      }
      return a.id < b.id ? -1 : 1;
    }),
  );
}

export function flagEvidence(rows, key = flagKey) {
  checkedKey(key);
  return rows
    .filter((row) => row.key === key)
    .map((row) => {
      const readable = row.type === 'plain' || row.decrypted === true;
      return {
        id: row.id,
        type: row.type,
        target: row.target ?? null,
        visibility: row.visibility ?? null,
        updatedAt: row.updatedAt ?? null,
        branchScoped: Boolean(row.gitBranch),
        integrationOwned: Boolean(row.configurationId),
        system: row.system ?? null,
        customEnvironmentIds: row.customEnvironmentIds ?? [],
        valueReadable: readable,
        boolean: readable && ['false', 'true'].includes(row.value) ? row.value === 'true' : null,
        valueSha256: readable && typeof row.value === 'string' ? digest(row.value) : null,
      };
    });
}

function flagKind(value) {
  if (value === undefined) {
    return 'missing';
  }
  return ['true', 'false'].includes(value) ? value : 'other';
}

export function baselineDiagnostics(snapshot) {
  const keyHash =
    typeof snapshot.environment.VITE_SUPABASE_ANON_KEY === 'string' ? digest(snapshot.environment.VITE_SUPABASE_ANON_KEY) : null;
  return {
    flagRows: flagEvidence(snapshot.flagRows),
    signupRows: flagEvidence(snapshot.signupRows || snapshot.rows, signupKey),
    signupAbsentAllScopes: !snapshot.rows.some((row) => row.key === signupKey),
    flagAbsentAllScopes: !snapshot.rows.some((row) => row.key === flagKey),
    effectiveFrontFlagKind: flagKind(snapshot.environment[flagKey]),
    effectiveServerFlagKind: flagKind(snapshot.environment.PRODUCT_TELEMETRY_ENABLED),
    effectiveRequireAuthKind: flagKind(snapshot.environment.VITE_REQUIRE_AUTH),
    effectiveSignupKind: flagKind(snapshot.environment.VITE_ENABLE_SIGNUP),
    fourBackendDiagnostic: backendKeys.map((key) => {
      const matches = snapshot.readableRows.filter((row) => row.key === key && row.target?.includes('production'));
      const row = matches.length === 1 ? matches[0] : null;
      const effective = snapshot.environment[key];
      return {
        key,
        productionRowCount: matches.length,
        present: Boolean(row),
        ownerSha256: typeof row?.value === 'string' ? digest(row.value) : null,
        effectiveSha256: typeof effective === 'string' ? digest(effective) : null,
        ownerEffectiveMatched: Boolean(row && typeof effective === 'string' && row.value === effective),
        dedicatedProductionScope: Boolean(row && JSON.stringify(row.target) === '["production"]'),
      };
    }),
    aliasDiagnostic: [snapshot.canonical, snapshot.custom].map((deployment, index) => ({
      alias: index === 0 ? pins.canonicalAlias : pins.customAlias,
      candidateIdMatched: deployment.id === pins.candidateId,
      sourceMatched: deployment.meta?.sourceSha === pins.sha,
      ciMatched: deployment.meta?.ciRun === pins.ciRun,
      backendMatched: deployment.meta?.backendUrl === targetUrl,
      publicKeyDigestMatched: keyHash !== null && deployment.meta?.publicKeySha256 === keyHash,
    })),
    ownerInventoryRepresentationSha256: inventoryHash(snapshot.rows),
    effectiveRepresentationSha256: hashObject(snapshot.environment),
  };
}

export function assertAbsent(rows, key = flagKey) {
  checkedKey(key);
  inventoryHash(rows);
  assert.equal(rows.filter((row) => row.key === key).length, 0, 'ALL_SCOPE_FLAG_ABSENCE_REQUIRED');
}

export function assertDispatch(event, env, head, branch) {
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, `refs/heads/${pins.branch}`);
  assert.equal(branch, pins.branch);
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(head, env.GITHUB_SHA);
  assert.equal(env.GITHUB_REPOSITORY, pins.repository);
  assert.equal(env.VERCEL_PROJECT_ID, pins.projectId);
  assert.equal(env.VERCEL_ORG_ID, pins.teamId);
  const input = event.inputs || {};
  for (const [name, expected] of Object.entries({ sha: pins.sha, tree: pins.tree, ci_run: pins.ciRun, previous_id: pins.candidateId })) {
    assert.equal(input[name], expected);
  }
  assert.equal(input.mode, 'inspect');
  assert.ok(operatorModes.includes(input.operator_mode));
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^[1-9][0-9]*$/);
  if (input.operator_mode !== 'inspect') {
    assert.match(input.absence_inspection_run || '', /^[1-9][0-9]*$/);
    assert.match(input.absence_receipt_sha256 || '', /^[a-f0-9]{64}$/);
    assert.notEqual(input.absence_inspection_run, env.GITHUB_RUN_ID);
  }
  return input;
}

export function assertBackend(rows, environment, canonicalDeployment, customDeployment) {
  for (const deployment of [canonicalDeployment, customDeployment]) {
    assertDeployment(deployment, pins.projectId, pins.sha);
    assert.equal(deployment.id, pins.candidateId);
    assert.equal(deployment.meta?.ciRun, pins.ciRun);
    assert.equal(deployment.meta?.backendUrl, targetUrl);
  }
  const evidence = productionRows(rows).map(({ key, row }) => {
    assert.ok(row);
    assert.equal(environment[key], row.value);
    if (key.endsWith('_URL')) {
      assert.equal(row.value, targetUrl);
    } else {
      assert.match(row.value, /^sb_publishable_[A-Za-z0-9_-]+$/);
    }
    return {
      key,
      id: row.id,
      type: row.type,
      target: row.target,
      updatedAt: row.updatedAt ?? null,
      ownerSha256: digest(row.value),
      effectiveSha256: digest(environment[key]),
      matched: true,
    };
  });
  assert.equal(environment.VITE_SUPABASE_ANON_KEY, environment.SUPABASE_ANON_KEY);
  for (const deployment of [canonicalDeployment, customDeployment]) {
    assert.equal(deployment.meta?.publicKeySha256, digest(environment.VITE_SUPABASE_ANON_KEY));
  }
  assert.equal(environment.VITE_REQUIRE_AUTH, 'true');
  assert.ok([undefined, 'false'].includes(environment.VITE_ENABLE_SIGNUP));
  const signupRows = rows.filter((row) => row.key === signupKey && row.target?.includes('production'));
  if (signupRows.length) {
    assert.equal(signupRows.length, 1);
    assert.equal(signupRows[0].value, 'false');
    assert.equal(environment.VITE_ENABLE_SIGNUP, 'false');
    assert.ok(signupRows[0].type === 'plain' || signupRows[0].decrypted === true);
  }
  assert.ok([undefined, 'false'].includes(environment[flagKey]));
  assert.ok([undefined, 'false'].includes(environment.PRODUCT_TELEMETRY_ENABLED));
  return evidence;
}

export function assertCreated(result, observed, key = flagKey) {
  checkedKey(key);
  assert.ok(result && Array.isArray(result.failed) && result.failed.length === 0 && result.created && !Array.isArray(result.created));
  const returned = result.created;
  for (const row of [returned, observed]) {
    assert.ok(row && row.key === key && row.type === 'plain' && row.value === 'false');
    assert.deepEqual(row.target, ['production']);
    assert.ok(typeof row.id === 'string' && row.id && Number.isSafeInteger(row.updatedAt) && row.updatedAt >= 0);
    assert.ok([undefined, ''].includes(row.gitBranch) && [undefined, null, ''].includes(row.configurationId));
    assert.ok([undefined, false].includes(row.system) && [undefined, 'config'].includes(row.visibility));
    assert.ok(row.customEnvironmentIds === undefined || (Array.isArray(row.customEnvironmentIds) && row.customEnvironmentIds.length === 0));
  }
  assert.ok(sameProductionMetadata(returned, observed));
  return observed;
}

export function assertSingleAddition(before, after, created, key = flagKey) {
  checkedKey(key);
  assertAbsent(before, key);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.filter((row) => row.key === key).length, 1);
  assert.equal(inventoryHash(after.filter((row) => row.id !== created.id)), inventoryHash(before));
  assert.ok(!before.some((row) => row.id === created.id));
}

export function assertEffectiveAddition(before, after, selectedKey = flagKey) {
  checkedKey(selectedKey);
  assert.ok(before[selectedKey] === undefined || before[selectedKey] === 'false');
  assert.equal(after[selectedKey], 'false');
  assert.deepEqual(
    Object.keys(after)
      .filter((key) => key !== selectedKey)
      .sort(),
    Object.keys(before)
      .filter((key) => key !== selectedKey)
      .sort(),
  );
  for (const [key, value] of Object.entries(before)) {
    if (key !== selectedKey) {
      assert.equal(after[key], value);
    }
  }
}

export function assertPriorProof(proof, env, snapshot, now = Date.now(), key = flagKey) {
  checkedKey(key);
  assert.equal(proof.status, 'owner-baseline-inspected');
  assert.equal(proof.mode, 'inspect');
  assert.equal(proof.sourceSha, env.GITHUB_SHA);
  assert.equal(proof.sourceBranch, pins.branch);
  assert.equal(proof.sourceRunId, env.absence_inspection_run);
  assert.equal(proof.mainSha, pins.sha);
  assert.equal(proof.mainTree, pins.tree);
  assert.equal(proof.ciRun, pins.ciRun);
  assert.equal(proof.candidateId, pins.candidateId);
  assert.equal(key === signupKey ? proof.signupAbsentAllScopes : proof.flagAbsentAllScopes, true);
  assert.deepEqual(key === signupKey ? proof.signupRows : proof.flagRows, []);
  assert.equal(proof.ownerInventoryRepresentationSha256, inventoryHash(snapshot.rows));
  assert.equal(proof.effectiveRepresentationSha256, hashObject(snapshot.environment));
  const age = now - Date.parse(proof.checkedAtUtc);
  assert.ok(Number.isFinite(age) && age >= 0 && age <= 15 * 60_000);
}

function backendRows(snapshot) {
  const signup = new Map((snapshot.signupRows || []).map((row) => [row.id, row]));
  return snapshot.readableRows.map((row) => signup.get(row.id) || row);
}

export async function operate(mode, actions, record) {
  const phase = async (name, work) => {
    record.phase = name;
    await actions.save(record);
    return work();
  };
  try {
    assert.ok(operatorModes.includes(mode));
    const selectedKey = mode === 'inspect' ? null : bootstrapKey(mode);
    await phase('current-source-and-mutators', actions.assertCurrent);
    const before = await phase('owner-and-effective-baseline', actions.snapshot);
    Object.assign(record, baselineDiagnostics(before));
    await actions.save(record);
    record.phase = 'strict-backend-and-flags';
    await actions.save(record);
    Object.assign(record, {
      mainSha: pins.sha,
      mainTree: pins.tree,
      ciRun: pins.ciRun,
      candidateId: pins.candidateId,
      canonicalAlias: pins.canonicalAlias,
      customAlias: pins.customAlias,
      backendUrl: targetUrl,
      fourBackend: assertBackend(backendRows(before), before.environment, before.canonical, before.custom),
      flagRows: flagEvidence(before.flagRows),
      flagAbsentAllScopes: !before.rows.some((row) => row.key === flagKey),
      ownerInventoryRepresentationSha256: inventoryHash(before.rows),
      effectiveRepresentationSha256: hashObject(before.environment),
      requireAuth: before.environment.VITE_REQUIRE_AUTH,
      signupEnabled: before.environment.VITE_ENABLE_SIGNUP ?? null,
      frontendFlagEffective: before.environment[flagKey] ?? null,
      serverFlagEffective: before.environment.PRODUCT_TELEMETRY_ENABLED ?? null,
      unrelatedSecretEffectiveValuesCompared: false,
      providerGlobalPauseProven: false,
      sourceReturnAllowed: false,
      deploymentPerformed: false,
      productionAliasesChanged: false,
    });
    await actions.save(record);
    if (selectedKey) {
      await phase('prior-inspection-and-absence', async () => {
        assertAbsent(before.rows, selectedKey);
        if (selectedKey === flagKey) {
          assert.equal(before.environment[signupKey], 'false');
        }
        await actions.assertPrior(before, selectedKey);
      });
    }
    await phase('fresh-current-source-and-mutators', actions.assertCurrent);
    const fresh = await phase('fresh-owner-cas', actions.snapshot);
    assertBackend(backendRows(fresh), fresh.environment, fresh.canonical, fresh.custom);
    assert.equal(inventoryHash(fresh.rows), inventoryHash(before.rows));
    assert.equal(hashObject(fresh.environment), hashObject(before.environment));
    if (mode === 'inspect') {
      record.status = 'owner-baseline-inspected';
    } else {
      assertAbsent(fresh.rows, selectedKey);
      if (selectedKey === flagKey) {
        assert.equal(fresh.environment[signupKey], 'false');
      }
      record.creation = 'attempted-no-retry';
      const result = await phase('create-one-production-false', () =>
        actions.create({ key: selectedKey, value: 'false', type: 'plain', target: ['production'] }),
      );
      const after = await phase('verify-created-owner-and-effective', actions.snapshot);
      const matches = after.rows.filter((row) => row.key === selectedKey);
      assert.equal(matches.length, 1);
      const created = assertCreated(result, matches[0], selectedKey);
      assertSingleAddition(fresh.rows, after.rows, created, selectedKey);
      assertEffectiveAddition(fresh.environment, after.environment, selectedKey);
      assertBackend(backendRows(after), after.environment, after.canonical, after.custom);
      await phase('final-current-source-and-mutators', actions.assertCurrent);
      record.creation = 'one-false-row-verified';
      record.createdFlagKey = selectedKey;
      record.createdFlag = flagEvidence([created], selectedKey)[0];
      record.status = 'production-false-flag-bootstrapped-no-deployment';
    }
    record.checkedAtUtc = new Date(actions.now()).toISOString();
    await actions.save(record);
    return record;
  } catch {
    record.status = 'failed-stopped-no-deployment';
    record.failureCategory =
      record.creation === 'attempted-no-retry' ? 'creation-unverified-operator-inspection-required' : 'guard-or-owner-operation-refused';
    record.noAutomaticRetryOrCompensation = true;
    record.finishedAtUtc = new Date(actions.now()).toISOString();
    await actions.save(record);
    return record;
  }
}

function cli(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    throw new Error('OPERATOR_CLI_FAILED');
  }
}

async function main(mode) {
  const env = process.env;
  const record = {
    format: 1,
    mode,
    status: 'started',
    phase: 'local-dispatch-guard',
    sourceReturnAllowed: false,
    deploymentPerformed: false,
    productionAliasesChanged: false,
    initializedAtUtc: new Date().toISOString(),
  };
  writeJson(receiptFile, record); // Exists before token access, CLI or any API request.
  let input;
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    input = assertDispatch(event, env, git('rev-parse', 'HEAD'), git('branch', '--show-current'));
    assert.equal(input.operator_mode, mode);
    assert.ok(env.VERCEL_TOKEN && env.GH_TOKEN);
    Object.assign(record, {
      sourceSha: env.GITHUB_SHA,
      sourceBranch: pins.branch,
      sourceRunId: env.GITHUB_RUN_ID,
      sourceRunAttempt: env.GITHUB_RUN_ATTEMPT,
    });
  } catch {
    Object.assign(record, { status: 'failed-stopped-no-deployment', failureCategory: 'local-dispatch-refused' });
    writeJson(receiptFile, record);
    process.exitCode = 1;
    return;
  }
  const owner = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.vercel.com/${path}${path.includes('?') ? '&' : '?'}teamId=${pins.teamId}`, {
      method,
      redirect: 'error',
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    return response.json();
  };
  const gh = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${pins.repository}/${path}`, {
      redirect: 'error',
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const assertCurrent = async () => {
    const current = await gh('branches/main');
    assertReleaseRun(await gh(`actions/runs/${pins.ciRun}`), pins.repository, pins.sha, 'main', current.commit.sha);
    assert.equal((await gh(`git/commits/${pins.sha}`)).tree.sha, pins.tree);
    assert.equal((await gh(`branches/${encodeURIComponent(pins.branch)}`)).commit.sha, env.GITHUB_SHA);
    for (const workflow of ['deploy.yml', 'cutover.yml']) {
      for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
        const result = await gh(`actions/workflows/${workflow}/runs?status=${status}&per_page=100`);
        assert.ok(result.total_count <= 100 && Array.isArray(result.workflow_runs));
        assert.ok(result.workflow_runs.every((run) => String(run.id) === env.GITHUB_RUN_ID));
      }
    }
  };
  const vercel = (args) => cli('vercel', [...args, '--scope', pins.teamId, '--token', env.VERCEL_TOKEN]);
  const inspect = async (alias) => {
    const resolved = JSON.parse(vercel(['inspect', alias, '--json', '--wait', '--timeout', '120s']));
    assert.match(resolved.id || '', /^dpl_[A-Za-z0-9]+$/);
    const actual = await owner(`v13/deployments/${resolved.id}`);
    assert.equal(actual.id, resolved.id);
    return actual;
  };
  const snapshot = async () => {
    const started = Date.now();
    const project = await owner(`v9/projects/${pins.projectId}`);
    assert.equal(project.id, pins.projectId);
    assert.equal(project.accountId, pins.teamId);
    const list = await owner(`v10/projects/${pins.projectId}/env`); // No branch/target/custom filter: all project scopes.
    const rows = Array.isArray(list) ? list : list.envs;
    assert.ok(!list.pagination?.next);
    inventoryHash(rows);
    const readById = (id) => owner(`v1/projects/${pins.projectId}/env/${encodeURIComponent(id)}`);
    const readableRows = await readableProductionRows(rows, readById);
    const publicFlagRows = [];
    for (const row of rows.filter((item) => [flagKey, signupKey].includes(item.key))) {
      if (row.type === 'encrypted' && row.decrypted !== true) {
        const actual = await readById(row.id);
        assert.equal(actual.decrypted, true);
        assert.ok(sameProductionMetadata(row, actual));
        publicFlagRows.push({ ...row, value: actual.value, decrypted: true });
      } else {
        publicFlagRows.push(row);
      }
    }
    const canonicalDeployment = await inspect(pins.canonicalAlias);
    const custom = await inspect(pins.customAlias);
    vercel(environmentPullArgs('main'));
    const environment = parseEnv(readFileSync('.vercel/.env.production.local', 'utf8'));
    assert.ok(Date.now() - started <= 120_000, 'FRESH_OWNER_SNAPSHOT_REQUIRED');
    return {
      rows,
      readableRows,
      flagRows: publicFlagRows.filter((row) => row.key === flagKey),
      signupRows: publicFlagRows.filter((row) => row.key === signupKey),
      environment,
      canonical: canonicalDeployment,
      custom,
    };
  };
  const assertPrior = async (before, selectedKey) => {
    const run = await gh(`actions/runs/${input.absence_inspection_run}`);
    assert.ok(run.status === 'completed' && run.conclusion === 'success' && run.event === 'workflow_dispatch');
    assert.equal(run.head_sha, env.GITHUB_SHA);
    assert.equal(run.head_branch, pins.branch);
    assert.equal(run.path, '.github/workflows/deploy.yml');
    assert.equal(run.head_repository?.full_name, pins.repository);
    const attempt = await gh(`actions/runs/${run.id}/attempts/${run.run_attempt}`);
    const result = await gh(`actions/runs/${run.id}/artifacts?per_page=100`);
    assert.ok(result.total_count <= 100);
    const artifacts = result.artifacts.filter((item) => item.name === artifactName && !item.expired);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].workflow_run?.id, run.id);
    const directory = mkdtempSync(join(tmpdir(), 'trajectory-owner-absence-'));
    cli('gh', ['run', 'download', String(run.id), '--repo', pins.repository, '--name', artifactName, '--dir', directory]);
    const raw = readFileSync(join(directory, 'telemetry-owner-baseline.json'));
    assert.equal(digest(raw), input.absence_receipt_sha256);
    const proof = JSON.parse(raw);
    assert.equal(proof.sourceRunAttempt, String(run.run_attempt));
    assert.ok(Date.parse(proof.checkedAtUtc) >= Date.parse(attempt.run_started_at));
    assertPriorProof(proof, { ...env, absence_inspection_run: input.absence_inspection_run }, before, Date.now(), selectedKey);
  };
  const result = await operate(
    mode,
    {
      assertCurrent,
      snapshot,
      assertPrior,
      create: (body) => owner(`v10/projects/${pins.projectId}/env?upsert=false`, 'POST', body),
      save: (value) => writeJson(receiptFile, value),
      now: Date.now,
    },
    record,
  );
  if (result.status === 'failed-stopped-no-deployment') {
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: result.status, phase: result.phase }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length === 2) {
    console.log(JSON.stringify({ status: 'offline-plan', liveCalls: 0, allowed: operatorModes, branch: pins.branch }));
  } else if (process.argv.length === 3 && operatorModes.includes(process.argv[2])) {
    await main(process.argv[2]);
  } else {
    console.error('UNSUPPORTED_OPERATOR_MODE');
    process.exitCode = 1;
  }
}
