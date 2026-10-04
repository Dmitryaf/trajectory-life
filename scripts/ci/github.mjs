import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTrustedRun, validateProof } from './policy.mjs';

export function githubClient(repository = process.env.GITHUB_REPOSITORY) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) {
    throw new Error('Invalid repository');
  }
  return async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub ${path}: HTTP ${response.status}`);
    }
    return response.json();
  };
}

export async function loadProof(api, runId, identity, repository) {
  if (!/^\d+$/.test(String(runId))) {
    throw new Error('Invalid proof run');
  }
  const run = await api(`actions/runs/${runId}`);
  if (!isTrustedRun(run, repository) || run.conclusion !== 'success' || run.status !== 'completed') {
    throw new Error('Proof run is not successful or trusted');
  }
  const commit = await api(`git/commits/${run.head_sha}`);
  if (commit.tree.sha !== identity.tree) {
    throw new Error('Proof source tree changed');
  }
  const { jobs } = await api(`actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`);
  const directory = mkdtempSync(join(tmpdir(), 'trajectory-browser-proof-'));
  execFileSync('gh', ['run', 'download', String(runId), '--repo', repository, '--name', 'browser-proof', '--dir', directory], {
    stdio: 'pipe',
  });
  const proof = JSON.parse(readFileSync(join(directory, 'proof.json'), 'utf8'));
  validateProof(proof, run, jobs, identity, repository);
  return proof;
}

export async function findProof(api, identity, repository, currentRunId, readProof = loadProof) {
  const { workflow_runs: runs } = await api('actions/workflows/ci.yml/runs?per_page=50');
  // A newer failure for the same tree invalidates older evidence. Never select
  // only green runs or chain a reused result as if it were a new browser run.
  for (const run of runs) {
    if (run.id === Number(currentRunId) || !isTrustedRun(run, repository)) {
      continue;
    }
    const commit = await api(`git/commits/${run.head_sha}`);
    if (commit.tree.sha !== identity.tree) {
      continue;
    }
    if (run.conclusion !== 'success' || run.status !== 'completed') {
      return { reason: `Same-tree run ${run.id} is ${run.conclusion || run.status}; full checks required` };
    }
    const { artifacts } = await api(`actions/runs/${run.id}/artifacts?per_page=100`);
    if (!artifacts.some((artifact) => artifact.name === 'browser-proof' && !artifact.expired)) {
      continue;
    }
    await readProof(api, run.id, identity, repository);
    return { runId: run.id, reason: `Reusing complete browser evidence from run ${run.id}` };
  }
  return { reason: 'No matching complete browser evidence; full checks required' };
}
