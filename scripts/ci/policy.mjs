import { createHash } from 'node:crypto';

export const projects = ['chromium', 'mobile-webkit', 'webkit'];
export const shards = [1, 2];
export const browserJobs = projects.flatMap((project) => shards.map((shard) => `browser-${project}-${shard}`));
export const proofLifetimeMs = 24 * 60 * 60 * 1000;

export function identityKey(identity) {
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function isTrustedRun(run, repository, now = Date.now()) {
  const age = now - Date.parse(run.created_at);
  return (
    run.path === '.github/workflows/ci.yml' &&
    ['pull_request', 'push', 'workflow_dispatch'].includes(run.event) &&
    run.head_repository?.full_name === repository &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= proofLifetimeMs
  );
}

export function validateReports(reports, identity) {
  validateReportSet(reports, identity, false);
}

export function validateFreshReports(reports, identity) {
  validateReportSet(reports, identity, true);
}

function validateReportSet(reports, identity, fresh) {
  if (reports.length !== browserJobs.length) {
    throw new Error('Missing browser reports');
  }
  for (const name of browserJobs) {
    const matches = reports.filter((report) => report.job === name);
    if (matches.length !== 1) {
      throw new Error(`Missing or duplicate report: ${name}`);
    }
    const report = matches[0];
    // A fresh matrix actually tests each allocated runner during image rollouts.
    // Reusing earlier evidence still requires an exact image version match.
    const imageVersion = report.identity?.imageVersion;
    if (typeof imageVersion !== 'string' || !imageVersion.trim()) {
      throw new Error(`Missing runner image version: ${name}`);
    }
    const expectedIdentity = fresh ? { ...identity, imageVersion } : identity;
    if (identityKey(report.identity) !== identityKey(expectedIdentity)) {
      throw new Error(`Different source or runner: ${name}`);
    }
    if (
      report.status !== 'passed' ||
      !Number.isInteger(report.passed) ||
      report.passed < 1 ||
      report.failed !== 0 ||
      report.flaky !== 0 ||
      report.interrupted !== 0
    ) {
      throw new Error(`Browser checks did not pass cleanly: ${name}`);
    }
  }
}

export function validateProof(proof, run, jobs, identity, repository, now = Date.now()) {
  if (!isTrustedRun(run, repository, now) || run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('Proof run is not a recent successful repository CI run');
  }
  if (proof.schema !== 1 || proof.runId !== run.id || proof.runAttempt !== run.run_attempt || proof.sha !== run.head_sha) {
    throw new Error('Proof provenance does not match its run');
  }
  for (const name of browserJobs) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].conclusion !== 'success') {
      throw new Error(`Full browser job was not successful: ${name}`);
    }
  }
  validateReports(proof.reports, identity);
}

export function assertGate(results, reused) {
  if (results.prepare?.result !== 'success' || results.quality?.result !== 'success') {
    throw new Error('Preparation or quality checks failed');
  }
  const expected = reused ? 'skipped' : 'success';
  if (results.browsers?.result !== expected) {
    throw new Error('Browser matrix did not finish in its required state');
  }
}
