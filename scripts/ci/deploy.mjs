import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { assertClientBuildEnvironment } from './build-environment.mjs';
import { githubClient } from './github.mjs';
import {
  assertDeployment,
  assertReleaseRun,
  candidateDeploymentArgs,
  deploymentUrl,
  promoteVerified,
  releaseTargets,
} from './release-policy.mjs';
import { assetSignature, smokePublic } from './smoke.mjs';
import { git, summary, writeJson } from './runtime.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const source = event.workflow_run;
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
  const response = await fetch(
    `https://api.vercel.com/v13/deployments/${result.id}?teamId=${encodeURIComponent(process.env.VERCEL_ORG_ID)}`,
    { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(20_000) },
  );
  assert.equal(response.status, 200, 'Unable to verify deployment ownership and source');
  const deployment = await response.json();
  assert.equal(deployment.id, result.id);
  return {
    id: deployment.id,
    url: deployment.url,
    projectId: deployment.projectId,
    readyState: deployment.readyState,
    meta: deployment.meta,
  };
}

await assertCurrent();
const target = releaseTargets[branch];
const previous = await inspect(target.alias);
assertDeployment(previous, projectId);
await assetSignature(deploymentUrl(previous.url));

vercel(['pull', '--yes', `--environment=${target.environment}`, `--git-branch=${branch}`]);
assertClientBuildEnvironment(parseEnv(readFileSync(`.vercel/.env.${target.environment}.local`, 'utf8')), target.projectRef);
vercel(['build', ...(branch === 'main' ? ['--prod'] : [])]);
const output = vercel(candidateDeploymentArgs(branch, sha, source.id), true);
// The pinned CLI supports structured output in non-interactive agent mode as
// well as the documented URL-only stdout. Never guess a URL from log text.
const candidateUrl = output.startsWith('{') ? JSON.parse(output).url : output;
const candidate = await inspect(deploymentUrl(candidateUrl));
assertDeployment(candidate, projectId, sha);
const record = {
  sha,
  branch,
  ciRun: source.id,
  previous: { id: previous.id, url: previous.url },
  candidate: { id: candidate.id, url: candidate.url },
  status: 'candidate',
};
writeJson('qa/ci/deployment.json', record);

const actions = {
  smoke: smokePublic,
  assertCurrent,
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
    assert.equal((await inspect(target.alias)).id, deployment.id, 'Alias must reference the exact verified deployment');
    const [alias, unique] = await Promise.all([assetSignature(`https://${target.alias}`), assetSignature(deploymentUrl(deployment.url))]);
    assert.deepEqual(alias, unique, 'Canonical assets must match the verified deployment');
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
  writeJson('qa/ci/deployment.json', record);
}
