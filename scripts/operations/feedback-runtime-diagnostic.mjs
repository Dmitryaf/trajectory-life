// Read-only Root operator. Default/import performs zero I/O. Raw logs are RAM-only.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const FIXED = Object.freeze({
  deploymentId: 'dpl_H8C1hCoKoWuHxEafZxh6JwV5Jun1',
  projectId: 'prj_O0neiglfpJG0JKq6jBYLJOE6buR4',
  teamId: 'team_sZTFAJUNjw3uCHNZarBQgdVb',
  branch: 'codex/feedback-recipient-ops-20261008',
  since: '2026-10-08T15:07:00Z',
  until: '2026-10-08T15:10:00Z',
  query: 'feedback',
  cliVersion: '60.1.3',
});
const need = (v) => {
  if (!v) {
    throw Error('FIXED_DIAGNOSTIC_REFUSAL');
  }
};
function phaseFor(code) {
  if (code.startsWith('AUTH_')) {
    return 'auth';
  }
  if (code.startsWith('DELIVERY_')) {
    return 'delivery';
  }
  return 'environment';
}
export function classify(raw) {
  need(Buffer.byteLength(raw) <= 2 * 1024 * 1024);
  const lines = raw.split(/\r?\n/).filter((x) => x.trim());
  need(lines.length <= 100);
  const found = new Set();
  let jsonRecords = 0,
    unknownMessages = 0;
  const walk = (v, depth = 0) => {
    need(depth <= 12);
    if (typeof v === 'string') {
      if (v === 'Feedback auth verification failed') {
        found.add('AUTH_VERIFICATION_REQUEST_FAILED');
      } else if (v === 'Feedback email delivery request failed') {
        found.add('DELIVERY_REQUEST_FAILED');
      } else if (v === 'Feedback function environment is incomplete') {
        found.add('ENVIRONMENT_INCOMPLETE');
      } else {
        const m = /^Feedback email delivery failed(?:[ :]+)([1-5][0-9]{2})$/.exec(v);
        if (m) {
          found.add('DELIVERY_HTTP_' + m[1]);
        } else if (v.includes('Feedback')) {
          unknownMessages++;
        }
      }
    } else if (Array.isArray(v)) {
      // Some JSONL request-log DTOs keep console arguments separately.
      if (v.length === 2 && v[0] === 'Feedback email delivery failed' && Number.isInteger(v[1]) && v[1] >= 100 && v[1] <= 599) {
        found.add('DELIVERY_HTTP_' + v[1]);
      }
      for (const x of v) {
        walk(x, depth + 1);
      }
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) {
        walk(x, depth + 1);
      }
    }
  };
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw Error('NON_JSON_LOG_OUTPUT');
    }
    need(row && typeof row === 'object');
    jsonRecords++;
    walk(row);
  }
  const facts = [...found].sort().map((code) => ({
    phase: phaseFor(code),
    code,
    upstreamStatus: /^DELIVERY_HTTP_[0-9]+$/.test(code) ? Number(code.slice(14)) : null,
  }));
  let classification = 'UNKNOWN';
  if (facts.length === 1) {
    classification = facts[0].phase.toUpperCase();
  }
  if (facts.length > 1) {
    classification = 'MULTIPLE_OBSERVED_PHASES';
  }
  return {
    facts,
    jsonRecords,
    unknownMessages,
    classification,
    initialCauseProven: false,
    scope: 'Exact source console constants observed in bounded deployment query; no provider error body or mailbox claim.',
  };
}
export function args() {
  return [
    'logs',
    FIXED.deploymentId,
    '--project',
    FIXED.projectId,
    '--scope',
    FIXED.teamId,
    '--since',
    FIXED.since,
    '--until',
    FIXED.until,
    '--query',
    FIXED.query,
    '--limit',
    '100',
    '--json',
    '--expand',
    '--no-follow',
    '--no-color',
  ];
}
export function run(output, cliPath, env = process.env) {
  need(
    env.GITHUB_ACTIONS === 'true' &&
      env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
      env.GITHUB_REF === 'refs/heads/' + FIXED.branch &&
      /^[a-f0-9]{40}$/.test(env.EXPECTED_OPERATOR_SHA || '') &&
      env.GITHUB_SHA === env.EXPECTED_OPERATOR_SHA &&
      env.VERCEL_TOKEN,
  );
  need(!existsSync(output));
  mkdirSync(output, { mode: 0o700 });
  const out = resolve(output, 'result.json');
  const result = {
    status: 'feedback-runtime-diagnostic-initialized',
    ...FIXED,
    operatorSha: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    phase: 'cli-package-pin',
    readOnly: true,
    providerMutations: 0,
    emailSent: false,
    rawLogsPersisted: false,
    initialCauseProven: false,
  };
  const persist = () => writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  persist();
  try {
    const cli = resolve(cliPath);
    const pkg = JSON.parse(readFileSync(resolve(cli, '../../package.json'), 'utf8'));
    need(pkg.name === 'vercel' && pkg.version === FIXED.cliVersion);
    const childEnv = { ...env, NO_UPDATE_NOTIFIER: '1', VERCEL_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', CI: '1' };
    delete childEnv.DEBUG;
    delete childEnv.NODE_OPTIONS;
    result.phase = 'bounded-runtime-log-read';
    persist();
    const p = spawnSync(process.execPath, [cli, ...args()], {
      env: childEnv,
      encoding: 'utf8',
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024,
    });
    result.cliExitCode = Number.isInteger(p.status) ? p.status : null;
    need(p.status === 0 && !p.error);
    result.phase = 'sanitized-source-classification';
    Object.assign(result, classify(p.stdout));
    result.status = 'readonly-feedback-runtime-diagnostic-completed';
  } catch {
    result.status = 'readonly-feedback-runtime-diagnostic-refused';
    result.failureCategory = 'FIXED_PHASE_PRIVATE_DETAILS_WITHHELD';
  }
  result.checkedAtUtc = new Date().toISOString();
  persist();
  return result;
}
function main() {
  if (process.argv.length === 2 || process.argv[2] === 'plan') {
    console.log(JSON.stringify({ status: 'offline-runtime-diagnostic-plan', filesRead: 0, liveCalls: 0 }));
    return;
  }
  need(process.argv[2] === 'inspect' && process.argv.length === 5);
  const r = run(process.argv[3], process.argv[4]);
  console.log(JSON.stringify({ status: r.status, phase: r.phase, classification: r.classification || 'UNKNOWN' }));
  if (r.status !== 'readonly-feedback-runtime-diagnostic-completed') {
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch {
    console.log(JSON.stringify({ status: 'offline-diagnostic-refused', privateDetailsWithheld: true }));
    process.exitCode = 1;
  }
}
