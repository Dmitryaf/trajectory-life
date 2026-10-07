import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertGate,
  browserContainerImage,
  browserJobs,
  isTrustedRun,
  proofLifetimeMs,
  validateFreshReports,
  validateProof,
} from './policy.mjs';
import { findProof } from './github.mjs';

const repository = 'owner/project';
const identity = {
  schema: 2,
  browserContainer: browserContainerImage,
  tree: 'tree-a',
  image: 'ubuntu24',
  imageVersion: 'image-a',
  node: 'v22',
  playwright: '1.61.1',
  workers: 1,
  shards: 2,
};
const run = {
  id: 12,
  run_attempt: 1,
  head_sha: 'commit-a',
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  head_repository: { full_name: repository },
  created_at: new Date().toISOString(),
  status: 'completed',
  conclusion: 'success',
};
const reports = browserJobs.map((job) => ({ job, identity, status: 'passed', passed: 3, failed: 0, flaky: 0, interrupted: 0 }));
const proof = { schema: 1, runId: run.id, runAttempt: 1, sha: run.head_sha, reports };
const jobs = browserJobs.map((name) => ({ name, conclusion: 'success' }));
const validResults = { prepare: { result: 'success' }, quality: { result: 'success' }, browsers: { result: 'success' } };

test('fresh shards may use different runner image versions without rewriting their evidence', () => {
  const copy = structuredClone(reports);
  copy[0].identity.imageVersion = 'image-b';
  const original = structuredClone(copy);
  assert.doesNotThrow(() => validateFreshReports(copy, identity));
  assert.deepEqual(copy, original);
  assert.throws(() => validateProof({ ...proof, reports: copy }, run, jobs, identity, repository));
});

for (const key of ['tree', 'node', 'playwright', 'image', 'workers', 'shards', 'schema', 'browserContainer']) {
  test(`fresh shards still reject a different ${key}`, () => {
    const copy = structuredClone(reports);
    copy[0].identity[key] = 'other';
    assert.throws(() => validateFreshReports(copy, identity));
  });
}

for (const imageVersion of [undefined, '', ' ', 123]) {
  test(`fresh shards reject missing or invalid runner image versions: ${String(imageVersion)}`, () => {
    const copy = structuredClone(reports);
    copy[0].identity.imageVersion = imageVersion;
    assert.throws(() => validateFreshReports(copy, identity));
  });
}

for (const patch of [{ failed: 1 }, { flaky: 1 }, { interrupted: 1 }, { passed: 0 }, { status: 'failed' }]) {
  test(`fresh shards reject unsuccessful evidence: ${JSON.stringify(patch)}`, () => {
    const copy = structuredClone(reports);
    Object.assign(copy[0], patch);
    assert.throws(() => validateFreshReports(copy, identity));
  });
}

test('fresh evidence requires exactly all six distinct shards', () => {
  assert.throws(() => validateFreshReports(reports.slice(1), identity));
  assert.throws(() => validateFreshReports([...reports, reports[0]], identity));
  assert.throws(() => validateFreshReports([reports[1], ...reports.slice(1)], identity));
});

test('accepts all six clean shards for the identical source and runner', () => {
  assert.doesNotThrow(() => validateProof(proof, run, jobs, identity, repository));
  assert.doesNotThrow(() => assertGate(validResults, false));
});

for (const [name, change] of [
  [
    'different source',
    (copy) => {
      copy.reports[0].identity.tree = 'other';
    },
  ],
  [
    'different runner',
    (copy) => {
      copy.reports[0].identity.imageVersion = 'other';
    },
  ],
  [
    'missing shard',
    (copy) => {
      copy.reports.pop();
    },
  ],
  [
    'duplicate shard',
    (copy) => {
      copy.reports[0] = copy.reports[1];
    },
  ],
  [
    'flaky scenario',
    (copy) => {
      copy.reports[0].flaky = 1;
    },
  ],
  [
    'failed scenario',
    (copy) => {
      copy.reports[0].failed = 1;
    },
  ],
  [
    'interrupted scenario',
    (copy) => {
      copy.reports[0].interrupted = 1;
    },
  ],
  [
    'empty browser job',
    (copy) => {
      copy.reports[0].passed = 0;
    },
  ],
  [
    'missing passed count',
    (copy) => {
      delete copy.reports[0].passed;
    },
  ],
  [
    'wrong run',
    (copy) => {
      copy.runId += 1;
    },
  ],
  [
    'old run attempt',
    (copy) => {
      copy.runAttempt += 1;
    },
  ],
  [
    'wrong checked commit',
    (copy) => {
      copy.sha = 'other';
    },
  ],
]) {
  test(`rejects ${name}`, () => {
    const copy = structuredClone(proof);
    change(copy);
    assert.throws(() => validateProof(copy, run, jobs, identity, repository));
  });
}

for (const patch of [
  { head_repository: { full_name: 'fork/project' } },
  { path: 'different.yml' },
  { conclusion: 'failure' },
  { status: 'in_progress' },
  { event: 'pull_request_target' },
  { created_at: new Date(Date.now() - proofLifetimeMs - 1000).toISOString() },
]) {
  test(`rejects untrusted, stale or unsuccessful evidence: ${JSON.stringify(patch)}`, () => {
    assert.throws(() => validateProof(proof, { ...run, ...patch }, jobs, identity, repository));
  });
}

test('a skipped or missing GitHub shard cannot satisfy the gate', () => {
  assert.throws(() => validateProof(proof, run, jobs.slice(1), identity, repository));
  assert.throws(() => validateProof(proof, run, [{ ...jobs[0], conclusion: 'skipped' }, ...jobs.slice(1)], identity, repository));
  assert.throws(() => assertGate({ ...validResults, browsers: { result: 'skipped' } }, false));
  assert.doesNotThrow(() => assertGate({ ...validResults, browsers: { result: 'skipped' } }, true));
  assert.throws(() => assertGate({ ...validResults, quality: { result: 'failure' } }, true));
});

test('invalid dates do not qualify as fresh evidence', () => {
  assert.equal(isTrustedRun({ ...run, created_at: 'invalid' }, repository), false);
});

test('a newer same-tree failure prevents falling back to an older green result', async () => {
  const api = async (path) => {
    if (path.includes('/runs?')) {
      return { workflow_runs: [{ ...run, id: 13, conclusion: 'failure' }, run] };
    }
    return { tree: { sha: identity.tree } };
  };
  const result = await findProof(api, identity, repository, 99, () => {
    throw new Error('Must not read older proof');
  });
  assert.equal(result.runId, undefined);
  assert.match(result.reason, /Same-tree run 13/);
});

test('selects a complete original run and ignores the current run', async () => {
  const api = async (path) => {
    if (path.includes('/runs?')) {
      return { workflow_runs: [{ ...run, id: 99 }, run] };
    }
    if (path.includes('/artifacts?')) {
      return { artifacts: [{ name: 'browser-proof', expired: false }] };
    }
    return { tree: { sha: identity.tree } };
  };
  const result = await findProof(api, identity, repository, 99, async (_api, id) => {
    assert.equal(id, run.id);
  });
  assert.equal(result.runId, run.id);
});

for (const container of [
  undefined,
  '',
  'mcr.microsoft.com/playwright:v1.61.1-noble',
  'mcr.microsoft.com/playwright@sha256:' + '0'.repeat(64),
]) {
  test(`fresh and reused evidence reject missing or different container: ${String(container)}`, () => {
    const copy = structuredClone(reports);
    copy[0].identity.browserContainer = container;
    assert.throws(() => validateFreshReports(copy, identity));
    assert.throws(() => validateProof({ ...proof, reports: copy }, run, jobs, identity, repository));
  });
}
test('a legacy context cannot authorize a legacy host-only browser proof', () => {
  const legacy = structuredClone(identity);
  legacy.schema = 1;
  delete legacy.browserContainer;
  const oldReports = browserJobs.map((job) => ({ ...reports[0], job, identity: legacy }));
  assert.throws(() => validateFreshReports(oldReports, legacy));
  assert.throws(() => validateProof({ ...proof, reports: oldReports }, run, jobs, legacy, repository));
});
