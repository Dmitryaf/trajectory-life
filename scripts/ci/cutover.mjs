import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { githubClient } from './github.mjs';
import { git, writeJson, summary } from './runtime.mjs';
import {
  assertDeployment,
  assertReleaseRun,
  candidateDeploymentArgs,
  deploymentUrl,
  environmentPullArgs,
  releaseTargets,
} from './release-policy.mjs';
import { assertPublishedBackend, assetSignature, publishedJavaScript, smokePublic } from './smoke.mjs';
import {
  appendCutoverOverrides,
  assertBackendAlignment,
  assertCandidate,
  assertClosedGate,
  backendKeys,
  cutoverEnvironment,
  cutoverFailureName,
  digest,
  hostedUrl,
  productionRows,
  promoteCutover,
  readableProductionRows,
  sanitizedRows,
  targetUrl,
} from './cutover-policy.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Dispatch must use main');
const input = event.inputs;
assert.ok(['inspect', 'candidate', 'promote'].includes(input.mode));
assert.match(input.sha || '', /^[a-f0-9]{40}$/);
assert.match(input.tree || '', /^[a-f0-9]{40}$/);
assert.match(input.ci_run || '', /^\d+$/);
assert.match(input.previous_id || '', /^dpl_[A-Za-z0-9]+$/);
assert.match(input.gate_marker || '', /^[A-Za-z0-9_-]{1,80}$/);
assert.equal(git('rev-parse', 'HEAD'), input.sha);
assert.equal(git('rev-parse', 'HEAD^{tree}'), input.tree);
assert.equal(process.env.VERCEL_ORG_ID, 'team_sZTFAJUNjw3uCHNZarBQgdVb');
assert.equal(process.env.VERCEL_PROJECT_ID, 'prj_O0neiglfpJG0JKq6jBYLJOE6buR4');
assert.ok(process.env.VERCEL_TOKEN, 'The existing Vercel publishing credential is required');
const projectId = process.env.VERCEL_PROJECT_ID;
const target = releaseTargets.main;
const github = githubClient();
const environment = cutoverEnvironment({}, process.env.VPS_PUBLIC_KEY);
const key = environment.VITE_SUPABASE_ANON_KEY;

function vercel(args, capture = false, overrides = {}) {
  try {
    const result = execFileSync('vercel', [...args, '--scope', process.env.VERCEL_ORG_ID, '--token', process.env.VERCEL_TOKEN], {
      env: { ...process.env, ...overrides },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 8 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return capture ? result.trim() : undefined;
  } catch {
    // CLI error objects include arguments and can disclose credentials.
    throw new Error(`Vercel ${args[0]} failed; inspect the sanitized receipt before continuing`);
  }
}

async function vercelApi(path, method = 'GET', body) {
  const response = await fetch(`https://api.vercel.com/${path}${path.includes('?') ? '&' : '?'}teamId=${process.env.VERCEL_ORG_ID}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
    redirect: 'error',
  });
  assert.ok(response.ok, `Vercel operator API failed: HTTP ${response.status}`);
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function assertCurrent() {
  const [run, branch] = await Promise.all([github(`actions/runs/${input.ci_run}`), github('branches/main')]);
  assertReleaseRun(run, process.env.GITHUB_REPOSITORY, input.sha, 'main', branch.commit.sha);
  const commit = await github(`git/commits/${input.sha}`);
  assert.equal(commit.tree.sha, input.tree, 'Source tree changed');
}

async function inspect(value) {
  const resolved = JSON.parse(vercel(['inspect', value, '--json', '--wait', '--timeout', '180s'], true));
  assert.match(resolved.id, /^dpl_[A-Za-z0-9]+$/);
  const result = await vercelApi(`v13/deployments/${resolved.id}`);
  assert.equal(result.id, resolved.id);
  const deployment = { id: result.id, url: result.url, projectId: result.projectId, readyState: result.readyState, meta: result.meta };
  assertDeployment(deployment, projectId);
  return deployment;
}

async function inspectAlias() {
  const [canonical, custom] = await Promise.all([inspect(target.alias), inspect('trajectory-life.ru')]);
  assert.equal(canonical.id, custom.id, 'Canonical app and custom domain differ');
  return canonical;
}

async function readRows() {
  const result = await vercelApi(`v10/projects/${projectId}/env`);
  const rows = Array.isArray(result) ? result : result.envs;
  assert.ok(Array.isArray(rows), 'Unexpected environment list response');
  return readableProductionRows(rows, (id) => vercelApi(`v1/projects/${projectId}/env/${encodeURIComponent(id)}`));
}

function pull() {
  vercel(environmentPullArgs('main'));
  return parseEnv(readFileSync('.vercel/.env.production.local', 'utf8'));
}

function assertClosedFlags(base) {
  assert.equal(base.VITE_REQUIRE_AUTH, 'true');
  for (const name of ['VITE_ENABLE_SIGNUP', 'VITE_PRODUCT_TELEMETRY_ENABLED', 'PRODUCT_TELEMETRY_ENABLED']) {
    assert.notEqual(base[name], 'true', 'Signup and telemetry must remain closed');
  }
}

async function candidateSmoke(candidate) {
  const origin = deploymentUrl(candidate.url);
  record.progressStage = 'candidate-public-smoke';
  const signature = await smokePublic(origin);
  record.progressStage = 'candidate-js-asset-read';
  const contents = await publishedJavaScript(origin, signature);
  record.progressStage = 'candidate-js-backend-check';
  assertPublishedBackend(contents, targetUrl, key, hostedUrl);
  return signature;
}

async function putRow(name, value, before) {
  record.progressStage = 'production-env-update';
  let result;
  if (before) {
    result = await vercelApi(`v9/projects/${projectId}/env/${encodeURIComponent(before.id)}`, 'PATCH', { value });
  } else {
    result = await vercelApi(`v10/projects/${projectId}/env`, 'POST', { key: name, value, type: 'plain', target: ['production'] });
    assert.deepEqual(result.failed || [], [], 'Environment creation failed');
    result = Array.isArray(result.created) ? result.created[0] : result.created;
  }
  assert.ok(result?.id, 'Environment write returned no ID; operator intervention is required');
  const after = productionRows(await readRows()).find((entry) => entry.key === name).row;
  assert.equal(after?.id, result.id);
  assert.equal(after?.value, value, 'Environment write was not observed');
  return after;
}

async function restoreRow({ before, after }) {
  record.progressStage = 'production-env-compensation';
  if (before) {
    await vercelApi(`v9/projects/${projectId}/env/${encodeURIComponent(after.id)}`, 'PATCH', { value: before.value });
    const restored = productionRows(await readRows()).find((entry) => entry.key === before.key).row;
    assert.equal(restored?.id, before.id);
    assert.equal(restored?.value, before.value);
  } else {
    await vercelApi(`v9/projects/${projectId}/env/${encodeURIComponent(after.id)}`, 'DELETE');
    assert.equal(productionRows(await readRows()).find((entry) => entry.key === after.key).row, null);
  }
}

const record = {
  schema: 1,
  mode: input.mode,
  sha: input.sha,
  tree: input.tree,
  branch: 'main',
  ciRun: Number(input.ci_run),
  backendUrl: targetUrl,
  publicKeySha256: digest(key),
  gateMarker: input.gate_marker,
  status: 'checking',
  progressStage: 'current-source-check',
};
const assertGate = () => assertClosedGate(fetch, key, input.gate_marker);
try {
  await assertCurrent();
  record.progressStage = 'project-owner-check';
  const project = await vercelApi(`v9/projects/${projectId}`);
  assert.equal(project.id, projectId);
  assert.equal(project.accountId, process.env.VERCEL_ORG_ID, 'Unexpected project owner');
  record.progressStage = 'previous-alias-check';
  const previous = await inspectAlias();
  assert.equal(previous.id, input.previous_id, 'Previous deployment changed');
  if (input.mode !== 'inspect') {
    assert.notEqual(previous.meta?.backendUrl, targetUrl, 'Initial Hosted-to-VPS cutover is already published');
  }
  record.previous = { id: previous.id, url: previous.url };
  record.progressStage = 'production-env-read';
  const rows = await readRows();
  record.productionParameters = sanitizedRows(rows);
  record.progressStage = 'production-env-pull';
  const base = pull();
  if (input.mode !== 'inspect') {
    assertBackendAlignment(base, target, previous);
    assert.equal(base.VITE_SUPABASE_URL.trim(), hostedUrl, 'Initial cutover starts only from Hosted production configuration');
    assertClosedFlags(base);
  }
  record.progressStage = 'closed-gate-check';
  await assertGate();
  if (input.mode === 'inspect') {
    record.status = 'inspected';
  } else if (input.mode === 'candidate') {
    const buildEnvironment = cutoverEnvironment({}, key);
    const rawBuildEnvironment = readFileSync('.vercel/.env.production.local', 'utf8');
    writeFileSync('.vercel/.env.production.local', appendCutoverOverrides(rawBuildEnvironment, key));
    record.progressStage = 'candidate-build';
    vercel(['build', '--prod'], false, buildEnvironment);
    await assertCurrent();
    await assertGate();
    assert.equal((await inspectAlias()).id, previous.id);
    const args = candidateDeploymentArgs('main', input.sha, input.ci_run);
    for (const name of backendKeys) {
      args.push('--env', `${name}=${environment[name]}`);
    }
    for (const meta of [
      `backendUrl=${targetUrl}`,
      'cutover=vps-candidate',
      `previousDeployment=${previous.id}`,
      `publicKeySha256=${digest(key)}`,
    ]) {
      args.push('--meta', meta);
    }
    record.progressStage = 'candidate-deploy';
    const output = vercel(args, true);
    const url = output.startsWith('{') ? JSON.parse(output).url : output;
    record.progressStage = 'candidate-inspect';
    const candidate = await inspect(deploymentUrl(url));
    assertDeployment(candidate, projectId, input.sha);
    assertCandidate(candidate, input.sha, input.ci_run, previous.id, key);
    record.candidate = { id: candidate.id, url: candidate.url };
    record.assets = await candidateSmoke(candidate);
    record.progressStage = 'candidate-final-guards';
    await assertCurrent();
    await assertGate();
    assert.equal((await inspectAlias()).id, previous.id);
    record.status = 'candidate-only';
  } else {
    assert.match(input.candidate_id || '', /^dpl_[A-Za-z0-9]+$/);
    assert.equal(input.before_user_writes, 'true');
    assert.equal(input.runtime_acceptance, 'true', 'Operator must first accept actual target Auth and Vercel runtime authentication');
    record.progressStage = 'promotion-candidate-check';
    const candidate = await inspect(input.candidate_id);
    assertDeployment(candidate, projectId, input.sha);
    assertCandidate(candidate, input.sha, input.ci_run, previous.id, key);
    record.candidate = { id: candidate.id, url: candidate.url };
    record.status = 'changing-production-environment';
    writeJson('qa/ci/cutover.json', record);
    record.progressStage = 'controlled-promotion';
    await promoteCutover(
      { candidate, previous, environment, beforeUserWrites: true },
      {
        assertCurrent,
        assertGate,
        inspectAlias,
        readRows,
        putRow,
        restoreRow,
        smoke: async () => {
          const assets = await candidateSmoke(candidate);
          record.progressStage = 'controlled-promotion';
          return assets;
        },
        verifyEnvironment: async () => {
          record.progressStage = 'production-env-verify';
          const aligned = pull();
          assertClosedFlags(aligned);
          assertBackendAlignment(aligned, target);
          for (const name of backendKeys) {
            assert.equal(aligned[name], environment[name], 'Effective production environment differs from candidate');
          }
        },
        promote: async (deployment) => {
          record.progressStage = 'alias-promotion-or-compensation';
          vercel(['promote', deploymentUrl(deployment.url), '--yes']);
        },
        verifyAlias: async (deployment) => {
          record.progressStage = 'alias-assets-verify';
          assert.equal((await inspectAlias()).id, deployment.id, 'Aliases do not reference the exact deployment');
          const [canonical, custom, unique] = await Promise.all([
            assetSignature(`https://${target.alias}`),
            assetSignature('https://trajectory-life.ru'),
            assetSignature(deploymentUrl(deployment.url)),
          ]);
          assert.deepEqual(canonical, unique);
          assert.deepEqual(custom, unique);
        },
      },
    );
    record.status = 'promoted-gate-closed';
  }
  summary(
    `Backend cutover ${input.mode}: ${record.status}; source ${input.sha}. Public candidate assets are not a claim of Deployment Protection or authenticated acceptance.`,
  );
} catch (error) {
  record.failureStage = record.progressStage;
  record.failureName = cutoverFailureName(error);
  record.status = 'stopped-needs-operator-review';
  // Provider errors can contain credentials; only the fixed failure name is retained.
  // eslint-disable-next-line preserve-caught-error
  throw new Error(
    'Backend cutover stopped. Inspect current aliases, target gate and sanitized evidence; do not blindly rerun or reopen writes.',
  );
} finally {
  writeJson('qa/ci/cutover.json', record);
}
