import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertGate, validateFreshReports } from './policy.mjs';
import { githubClient, loadProof } from './github.mjs';
import { summary, writeJson } from './runtime.mjs';

const context = JSON.parse(readFileSync('qa/ci/context.json', 'utf8'));
assertGate(JSON.parse(process.env.CI_RESULTS), Boolean(context.reuse.runId));
if (context.reuse.runId) {
  await loadProof(githubClient(), context.reuse.runId, context.identity, process.env.GITHUB_REPOSITORY);
  summary(
    `Browser gate revalidated against [run ${context.reuse.runId}](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${context.reuse.runId}). Current source tree and runner match; current quality checks passed.`,
  );
} else {
  const files = readdirSync('qa/ci/reports').filter((name) => name.startsWith('browser-') && name.endsWith('.json'));
  const reports = files.map((name) => JSON.parse(readFileSync(join('qa/ci/reports', name), 'utf8')));
  validateFreshReports(reports, context.identity);
  writeJson('qa/ci/proof.json', {
    schema: 1,
    runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    sha: context.sha,
    reports,
  });
  summary(
    `Full browser gate: ${reports.reduce((count, report) => count + report.passed, 0)} passed across ${reports.length} shards; zero failed, flaky or interrupted scenarios.`,
  );
}
