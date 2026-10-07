import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertBackendAlignment, productionRows, readableProductionRows, sameRow } from './cutover-policy.mjs';
import {
  assertTelemetryEnvironment,
  assertTelemetryTransition,
  changeTelemetryFlag,
  customProductionAlias,
  readableTelemetryFlag,
  releaseSource,
  telemetryInspection,
  telemetryKey,
} from './telemetry-release-policy.mjs';
import { githubClient } from './github.mjs';
import {
  assertDeployment,
  assertReleaseRun,
  candidateDeploymentArgs,
  deploymentUrl,
  environmentPullArgs,
  promoteVerified,
  releaseTargets,
} from './release-policy.mjs';
import { assetSignature, smokePublic } from './smoke.mjs';
import { git, summary, writeJson } from './runtime.mjs';

export function assertDevelopmentRollbackGraph({ branch, deploymentId, previousId, aliasId, aliasGraph, previousGraph }) {
  assert.equal(branch, 'develop', 'Canonical predecessor graph is only valid for development rollback');
  assert.match(previousId, /^dpl_[a-zA-Z0-9]+$/, 'Captured predecessor identity is required');
  assert.equal(deploymentId, previousId, 'Canonical predecessor graph cannot verify a new candidate');
  assert.equal(aliasId, previousId, 'Rollback alias must reference the captured predecessor');
  assert.ok(Array.isArray(previousGraph) && previousGraph.length > 0, 'Captured predecessor graph is required');
  assert.deepEqual(aliasGraph, previousGraph, 'Restored staging assets must match the captured predecessor graph');
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const tree = git('rev-parse', 'HEAD^{tree}');
  const source = releaseSource(event, process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF, git('rev-parse', 'HEAD'), tree);
  const telemetry = source.telemetry;
  const api = githubClient();
  const sha = git('rev-parse', 'HEAD');
  const branch = source.head_branch;
  const projectId = process.env.VERCEL_PROJECT_ID;
  assert.ok(process.env.VERCEL_TOKEN, 'Repository secret VERCEL_TOKEN is required; the existing deployment remains active');
  assert.ok(projectId && process.env.VERCEL_ORG_ID, 'Vercel project and organization must be set');

  async function assertCurrent() {
    const [run, current] = await Promise.all([api(`actions/runs/${source.id}`), api(`branches/${branch}`)]);
    assertReleaseRun(run, process.env.GITHUB_REPOSITORY, sha, branch, current.commit.sha);
  }

  function vercel(args, capture = false) {
    try {
      return execFileSync('vercel', [...args, '--scope', process.env.VERCEL_ORG_ID, '--token', process.env.VERCEL_TOKEN], {
        encoding: 'utf8',
        stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
        timeout: 8 * 60_000,
      })?.trim();
    } catch {
      // Do not include execFile's error/command: it contains the token argument.
      throw new Error(`Vercel ${args[0]} failed; no further promotion is allowed`);
    }
  }

  async function inspect(url) {
    const result = JSON.parse(vercel(['inspect', url, '--json', '--wait', '--timeout', '180s'], true));
    // CLI JSON intentionally omits projectId and source metadata. Read the owner
    // representation by the resolved ID; never log its private environment fields.
    assert.match(result.id, /^dpl_[a-zA-Z0-9]+$/);
    const deployment = await vercelApi(`v13/deployments/${result.id}`);
    assert.equal(deployment.id, result.id);
    return {
      id: deployment.id,
      url: deployment.url,
      projectId: deployment.projectId,
      readyState: deployment.readyState,
      meta: deployment.meta,
    };
  }

  async function vercelApi(path, method = 'GET', body) {
    const response = await fetch(`https://api.vercel.com/${path}?teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`, {
      method,
      redirect: 'error',
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, 'Vercel owner operation failed; private response withheld');
    try {
      return await response.json();
    } catch {
      throw new Error('Invalid Vercel owner response; private details withheld');
    }
  }

  function pullEnvironment() {
    vercel(environmentPullArgs(branch));
    return parseEnv(readFileSync(`.vercel/.env.${target.environment}.local`, 'utf8'));
  }

  async function readTelemetryRows() {
    const result = await vercelApi(`v10/projects/${projectId}/env`);
    const rows = Array.isArray(result) ? result : result.envs;
    const readById = (id) => vercelApi(`v1/projects/${projectId}/env/${encodeURIComponent(id)}`);
    const readable = await readableProductionRows(rows, readById);
    return { rows: readable, flag: await readableTelemetryFlag(rows, readById) };
  }

  await assertCurrent();
  const target = releaseTargets[branch];
  const previous = await inspect(target.alias);
  assertDeployment(previous, projectId);
  const previousGraph = await assetSignature(branch === 'develop' ? `https://${target.alias}` : deploymentUrl(previous.url));
  if (branch === 'develop') {
    assert.equal((await inspect(target.alias)).id, previous.id, 'Staging predecessor changed during baseline capture');
  }
  let clientEnvironment = pullEnvironment();
  assertBackendAlignment(clientEnvironment, target, previous);
  let baseline;
  let expectedFlag;
  let record;

  async function assertTelemetryAliases() {
    const [canonical, custom] = await Promise.all([inspect(target.alias), inspect(customProductionAlias)]);
    assertDeployment(canonical, projectId);
    assertDeployment(custom, projectId);
    assert.equal(canonical.id, telemetry.previous_id, 'Canonical deployment changed');
    assert.equal(custom.id, telemetry.previous_id, 'Custom deployment changed');
    return custom;
  }

  async function assertTelemetryCurrent() {
    await assertCurrent();
    await assertTelemetryAliases();
    const current = await readTelemetryRows();
    assert.ok(sameRow(current.flag, expectedFlag), 'Telemetry flag changed during candidate verification');
    for (const { key, row } of productionRows(baseline.rows)) {
      assert.ok(sameRow(row, productionRows(current.rows).find((entry) => entry.key === key).row), 'Backend owner row changed');
    }
  }

  async function publishCandidate() {
    vercel(['build', ...(branch === 'main' ? ['--prod'] : [])]);
    const output = vercel(
      [
        ...candidateDeploymentArgs(branch, sha, source.id),
        '--meta',
        `backendUrl=${clientEnvironment.VITE_SUPABASE_URL.trim()}`,
        '--meta',
        `telemetryEnabled=${clientEnvironment[telemetryKey] === 'true'}`,
      ],
      true,
    );
    // The pinned CLI supports structured output or documented URL-only stdout.
    const candidateUrl = output.startsWith('{') ? JSON.parse(output).url : output;
    const candidate = await inspect(deploymentUrl(candidateUrl));
    assertDeployment(candidate, projectId, sha);
    assert.equal(
      candidate.meta?.telemetryEnabled,
      String(clientEnvironment[telemetryKey] === 'true'),
      'Candidate telemetry metadata differs',
    );
    record ||= {};
    Object.assign(record, {
      sha,
      branch,
      tree,
      ciRun: source.id,
      backendUrl: clientEnvironment.VITE_SUPABASE_URL.trim(),
      telemetryEnabled: clientEnvironment[telemetryKey] === 'true',
      frontendTelemetryEnabled: clientEnvironment[telemetryKey] ?? 'false',
      previous: { id: previous.id, url: previous.url },
      candidate: { id: candidate.id, url: candidate.url },
      status: 'candidate',
    });
    writeJson('qa/ci/deployment.json', record);
    const actions = {
      smoke: smokePublic,
      assertCurrent: telemetry ? assertTelemetryCurrent : assertCurrent,
      inspectAlias: async () => inspect(target.alias),
      promote: async (deployment) => {
        const url = deploymentUrl(deployment.url);
        if (branch === 'main') {
          vercel(['promote', url, '--yes']);
        } else {
          vercel(['alias', 'set', url, target.alias]);
        }
      },
      verifyAlias: async (deployment) => {
        const aliasId = (await inspect(target.alias)).id;
        assert.equal(aliasId, deployment.id, 'Alias must reference the exact verified deployment');
        if (branch === 'develop' && deployment.id === previous.id) {
          assertDevelopmentRollbackGraph({
            branch,
            deploymentId: deployment.id,
            previousId: previous.id,
            aliasGraph: await assetSignature(`https://${target.alias}`),
            aliasId: (await inspect(target.alias)).id,
            previousGraph,
          });
          return;
        }
        const [alias, unique] = await Promise.all([
          assetSignature(`https://${target.alias}`),
          assetSignature(deploymentUrl(deployment.url)),
        ]);
        assert.deepEqual(alias, unique, 'Canonical assets must match the verified deployment');
        if (telemetry) {
          assert.equal((await inspect(customProductionAlias)).id, deployment.id, 'Custom alias must match the exact deployment');
          assert.deepEqual(await assetSignature(`https://${customProductionAlias}`), unique, 'Custom alias assets differ');
        }
      },
    };
    try {
      await promoteVerified({ candidate, previous, sha, projectId }, actions);
      record.status = 'promoted-and-verified';
      summary(
        `Published \`${sha}\` to [${target.alias}](https://${target.alias}) after CI and candidate smoke. Deployment: \`${candidate.id}\`; previous: \`${previous.id}\`. Authenticated-account acceptance is separate.`,
      );
    } catch (error) {
      record.status = 'failed';
      throw error;
    } finally {
      record.finishedAtUtc = new Date().toISOString();
      writeJson('qa/ci/deployment.json', record);
    }
  }

  if (!telemetry) {
    await publishCandidate();
  } else {
    assert.equal(process.env.VERCEL_ORG_ID, 'team_sZTFAJUNjw3uCHNZarBQgdVb');
    assert.equal(projectId, 'prj_O0neiglfpJG0JKq6jBYLJOE6buR4');
    const custom = await assertTelemetryAliases();
    baseline = await readTelemetryRows();
    assertTelemetryEnvironment(clientEnvironment, baseline.rows, previous, telemetry.previous_id);
    assert.equal(clientEnvironment[telemetryKey], baseline.flag.value, 'Effective telemetry flag differs from owner row');
    record = telemetryInspection({ ...source, sha, tree }, previous, custom, clientEnvironment, baseline.flag, baseline.rows);
    record.operation = telemetry.mode;
    record.rootBackendAccepted = telemetry.backend_accepted === true || telemetry.backend_accepted === 'true';
    record.rootPostOpenBackupAccepted = telemetry.post_open_backup_accepted === true || telemetry.post_open_backup_accepted === 'true';
    record.rootBackendReceiptSha256 = telemetry.backend_receipt_sha256 || null;
    record.rootBackupReceiptSha256 = telemetry.backup_receipt_sha256 || null;
    writeJson('qa/ci/deployment.json', record);
    expectedFlag = baseline.flag;
    await assertTelemetryCurrent();
    if (telemetry.mode === 'inspect') {
      record.checkedAtUtc = new Date().toISOString();
      writeJson('qa/ci/deployment.json', record);
      summary('Read-only VPS frontend telemetry inspection completed. No config or deployment was changed.');
    } else {
      const beforeEnvironment = clientEnvironment;
      const flagActions = {
        assertCurrent: assertTelemetryCurrent,
        assertPreviousAlias: assertTelemetryAliases,
        readFlag: async () => (await readTelemetryRows()).flag,
        update: (id, value) => vercelApi(`v9/projects/${projectId}/env/${encodeURIComponent(id)}`, 'PATCH', { value }),
        save: async (value) => writeJson('qa/ci/deployment.json', value),
      };
      await changeTelemetryFlag(
        baseline.flag,
        telemetry.mode === 'enable' ? 'true' : 'false',
        flagActions,
        async (after) => {
          expectedFlag = after;
          clientEnvironment = pullEnvironment();
          const current = await readTelemetryRows();
          assertTelemetryTransition(beforeEnvironment, clientEnvironment, baseline.rows, current.rows, after.value);
          assertTelemetryEnvironment(clientEnvironment, current.rows, previous, telemetry.previous_id);
          await assertTelemetryCurrent();
          await publishCandidate();
        },
        record,
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch {
    // Assertion diffs can contain private environment values. Never print them.
    console.error('Verified deployment failed; private details withheld. Inspect sanitized deployment-evidence.');
    process.exitCode = 1;
  }
}
