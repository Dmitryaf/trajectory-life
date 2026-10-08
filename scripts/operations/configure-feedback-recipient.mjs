import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECT = 'prj_O0neiglfpJG0JKq6jBYLJOE6buR4';
export const TEAM = 'team_sZTFAJUNjw3uCHNZarBQgdVb';
export const sha = (v) => createHash('sha256').update(v).digest('hex');
export function canonical(v) {
  if (Array.isArray(v)) {
    return v.map(canonical);
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])]),
    );
  }
  return v;
}
export const fingerprint = (v) => sha(JSON.stringify(canonical(v)));
export function dedicated(rows, key, required = true) {
  const matches = rows.filter((r) => r.key === key);
  const prod = matches.filter((r) => r.target?.includes('production'));
  assert.ok(prod.length === 1 || (!required && prod.length === 0), 'ROW_COUNT');
  const r = prod[0];
  if (!r) {
    assert.equal(matches.length, 0, 'ABSENCE_ALL_SCOPES');
    return null;
  }
  assert.deepEqual(r.target, ['production'], 'ROW_SCOPE');
  assert.ok(!r.gitBranch && !r.configurationId && !r.system && !r.customEnvironmentIds?.length, 'ROW_MANAGED');
  const sensitiveRecipient = ['FEEDBACK_TO_EMAIL', 'ERROR_TO_EMAIL'].includes(key) && r.type === 'sensitive';
  assert.ok(r.visibility === undefined || r.visibility === 'config' || (sensitiveRecipient && r.visibility === 'secret'), 'ROW_VISIBILITY');
  assert.ok(['plain', 'encrypted'].includes(r.type) || sensitiveRecipient, 'ROW_TYPE');
  assert.ok(typeof r.id === 'string' && r.id.length > 0 && Number.isFinite(r.updatedAt), 'ROW_ID_TIME');
  return r;
}
function rowMetadata(r) {
  return Object.fromEntries(Object.entries(r).filter(([key]) => !['value', 'decrypted'].includes(key)));
}
function inventory(rows) {
  return [...rows]
    .sort((a, b) => {
      if (a.id < b.id) {
        return -1;
      }
      if (a.id > b.id) {
        return 1;
      }
      return 0;
    })
    .map((r) => ({
      metadata: rowMetadata(r),
      representationSha256: sha(typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? null)),
    }));
}
function address(v) {
  assert.ok(typeof v === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v), 'ADDRESS');
  return v;
}
function visibilityKind(value) {
  if (value === undefined) {
    return 'omitted';
  }
  if (['config', 'secret', 'sensitive'].includes(value)) {
    return value;
  }
  return 'other';
}
export function otherRowsUnchanged(before, after, selected) {
  assert.equal(
    fingerprint(inventory(before.filter((r) => !selected.includes(r.key)))),
    fingerprint(inventory(after.filter((r) => !selected.includes(r.key)))),
    'OTHER_ENV_DRIFT',
  );
}
export async function snapshot(api, expectedId, diagnostic = () => {}, pull) {
  assert.match(expectedId, /^dpl_[A-Za-z0-9]+$/);
  for (const host of ['trajectory-app-lilac.vercel.app', 'trajectory-life.ru']) {
    const a = await api(`v4/aliases/${host}`);
    assert.equal(a.alias, host, 'ALIAS');
    assert.equal(a.projectId, PROJECT, 'ALIAS_PROJECT');
    assert.equal(a.deploymentId, expectedId, 'ALIAS_OWNER');
    assert.ok(!a.redirect, 'ALIAS_REDIRECT');
  }
  const d = await api(`v13/deployments/${expectedId}`);
  assert.equal(d.id, expectedId);
  assert.equal(d.projectId, PROJECT);
  assert.equal(d.readyState, 'READY');
  assert.equal(d.meta?.backendUrl, 'https://api.trajectory-life.ru', 'BACKEND');
  assert.equal(d.meta?.sourceSha, 'de1a2a8fda61901d765a96a0dc8eb070de160a80', 'SOURCE');
  const listed = await api(`v10/projects/${PROJECT}/env`);
  const rows = Array.isArray(listed) ? listed : listed.envs;
  assert.ok(Array.isArray(rows) && rows.length > 0 && new Set(rows.map((r) => r.id)).size === rows.length, 'INVENTORY');
  diagnostic({
    selectedRows: rows
      .filter((r) => ['FEEDBACK_TO_EMAIL', 'FEEDBACK_FROM_EMAIL', 'ERROR_TO_EMAIL', 'ERROR_FROM_EMAIL', 'RESEND_API_KEY'].includes(r.key))
      .map((r) => ({
        key: r.key,
        id: typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(r.id) ? r.id : null,
        type: ['plain', 'encrypted', 'sensitive', 'secret'].includes(r.type) ? r.type : 'other',
        target: Array.isArray(r.target) ? r.target.map((t) => (['production', 'preview', 'development'].includes(t) ? t : 'other')) : null,
        updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : null,
        visibility: visibilityKind(r.visibility),
        branchScoped: Boolean(r.gitBranch),
        integrationOwned: Boolean(r.configurationId),
        system: Boolean(r.system),
        customEnvironmentCount: Array.isArray(r.customEnvironmentIds) ? r.customEnvironmentIds.length : null,
      })),
  });
  let pulled;
  if (
    rows.some((r) => ['FEEDBACK_TO_EMAIL', 'ERROR_TO_EMAIL'].includes(r.key) && r.target?.includes('production') && r.type === 'sensitive')
  ) {
    // Validate both scopes BEFORE invoking the deployment-authorized pull.
    dedicated(rows, 'FEEDBACK_TO_EMAIL');
    dedicated(rows, 'ERROR_TO_EMAIL', false);
    assert.equal(typeof pull, 'function', 'SENSITIVE_PULL_REQUIRED');
    pulled = await pull();
    const afterPull = await api(`v10/projects/${PROJECT}/env`);
    const afterRows = Array.isArray(afterPull) ? afterPull : afterPull.envs;
    assert.equal(fingerprint(inventory(afterRows)), fingerprint(inventory(rows)), 'OWNER_CHANGED_DURING_PULL');
    diagnostic({ sensitiveRecipientReadMethod: 'fresh-vercel-60.1.3-production-pull', privatePullPersistedInArtifacts: false });
  }
  const read = async (key, required = true) => {
    const r = dedicated(rows, key, required);
    if (!r) {
      return null;
    }
    if (r.type === 'sensitive') {
      const value = pulled?.[key];
      assert.ok(typeof value === 'string' && !/\[(?:SENSITIVE|REDACTED)\]/.test(value), 'SENSITIVE_PULL_UNREADABLE');
      return address(value);
    }
    if (r.type === 'plain' || r.decrypted === true) {
      assert.ok(typeof r.value === 'string', 'VALUE');
      return r.value;
    }
    const actual = await api(`v1/projects/${PROJECT}/env/${encodeURIComponent(r.id)}`);
    assert.equal(actual.decrypted, true, 'DECRYPTION');
    // LIST is authority; only documented absent/false/null defaults bridge DTOs.
    for (const k of ['id', 'key', 'type', 'visibility', 'updatedAt', 'gitBranch']) {
      assert.equal(actual[k], r[k], 'DECRYPT_METADATA');
    }
    assert.deepEqual(actual.target, r.target, 'DECRYPT_SCOPE');
    assert.ok(!actual.configurationId && !actual.system && !actual.customEnvironmentIds?.length, 'DECRYPT_MANAGED');
    assert.ok(typeof actual.value === 'string' && !actual.value.includes('[SENSITIVE]'), 'READABLE');
    return actual.value;
  };
  const feedback = address(await read('FEEDBACK_TO_EMAIL'));
  const error = await read('ERROR_TO_EMAIL', false);
  if (error !== null) {
    address(error);
  }
  const sender = await read('FEEDBACK_FROM_EMAIL');
  assert.ok(sender, 'SENDER');
  const senderAddress = sender.match(/<([^<>]+)>$/)?.[1] || sender;
  diagnostic({
    senderUsesProjectDomain: /@(?:[a-z0-9-]+\.)?trajectory-life\.ru$/i.test(senderAddress),
    senderUsesResendSandbox: /@resend\.dev$/i.test(senderAddress),
  });
  assert.ok(
    rows.some((r) => r.key === 'RESEND_API_KEY' && r.target?.includes('production')),
    'RESEND_MISSING',
  );
  for (const key of ['VITE_FEEDBACK_ENABLED', 'VITE_REQUIRE_AUTH', 'VITE_ENABLE_SIGNUP', 'VITE_PRODUCT_TELEMETRY_ENABLED']) {
    assert.equal(await read(key), 'true', 'FRONTEND_FLAGS');
  }
  for (const key of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    assert.equal(await read(key), 'https://api.trajectory-life.ru', 'URL');
  }
  const browserKey = await read('VITE_SUPABASE_ANON_KEY');
  assert.match(browserKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
  assert.equal(await read('SUPABASE_ANON_KEY'), browserKey, 'KEY_ALIGNMENT');
  return { rows, feedback, error, publicKeySha256: sha(browserKey) };
}
export async function operate(mode, api, expectedId, prior, record, save, now = () => Date.now(), recipient, pull) {
  address(recipient);
  const start = now();
  const window = () => assert.ok(now() - start <= 120_000, 'WINDOW_EXPIRED');
  record.phase = 'owner-read';
  save();
  const diagnostic = (fields) => {
    Object.assign(record, fields);
    save();
  };
  const before = await snapshot(api, expectedId, diagnostic, pull);
  Object.assign(record, {
    checkedAtUtc: new Date(now()).toISOString(),
    deploymentId: expectedId,
    inventorySha256: fingerprint(inventory(before.rows)),
    feedbackRecipientSha256: sha(before.feedback),
    requestedRecipientSha256: sha(recipient),
    feedbackRecipientMatchesRequested: before.feedback === recipient,
    technicalRecipientSha256: sha(before.error ?? before.feedback),
    errorRecipientExplicit: before.error !== null,
    publicKeySha256: before.publicKeySha256,
    unrelatedSecretPlaintextCompared: false,
  });
  save();
  if (mode === 'inspect') {
    window();
    record.status = 'feedback-mail-config-inspected';
    save();
    return;
  }
  assert.equal(mode, 'apply');
  assert.equal(prior.status, 'feedback-mail-config-inspected', 'PRIOR_STATUS');
  assert.equal(prior.deploymentId, expectedId);
  assert.equal(prior.inventorySha256, record.inventorySha256);
  assert.equal(prior.feedbackRecipientSha256, record.feedbackRecipientSha256);
  assert.equal(prior.technicalRecipientSha256, record.technicalRecipientSha256);
  assert.equal(prior.requestedRecipientSha256, sha(recipient));
  assert.equal(prior.operatorSourceSha, record.operatorSourceSha);
  assert.ok(now() - Date.parse(prior.checkedAtUtc) >= 0 && now() - Date.parse(prior.checkedAtUtc) <= 900_000, 'PRIOR_STALE');
  let current = before;
  const fresh = async () => {
    const next = await snapshot(api, expectedId, diagnostic, pull);
    assert.equal(fingerprint(inventory(next.rows)), fingerprint(inventory(current.rows)), 'FRESH_CAS');
    window();
    current = next;
  };
  // Preserve the previous fallback BEFORE changing the feedback recipient.
  if (current.error === null && current.feedback !== recipient) {
    await fresh();
    record.phase = 'preserve-technical-recipient';
    record.mutationAttempted = true;
    save();
    const response = await api(`v10/projects/${PROJECT}/env?upsert=false`, 'POST', {
      key: 'ERROR_TO_EMAIL',
      value: current.feedback,
      type: 'plain',
      target: ['production'],
    });
    assert.deepEqual(response.failed || [], [], 'CREATE_FAILED');
    const created = Array.isArray(response.created) ? response.created[0] : response.created;
    assert.ok(created?.id, 'CREATE_AMBIGUOUS');
    const next = await snapshot(api, expectedId, diagnostic, pull);
    assert.equal(dedicated(next.rows, 'ERROR_TO_EMAIL').id, created.id, 'CREATE_OWNER');
    assert.equal(next.error, current.feedback, 'TECHNICAL_RECIPIENT');
    otherRowsUnchanged(current.rows, next.rows, ['ERROR_TO_EMAIL']);
    record.technicalRecipientPreserved = true;
    record.createdErrorRowId = created.id;
    save();
    current = next;
  }
  if (current.feedback !== recipient) {
    await fresh();
    const row = dedicated(current.rows, 'FEEDBACK_TO_EMAIL');
    record.phase = 'change-feedback-recipient';
    record.mutationAttempted = true;
    save();
    const updated = await api(`v9/projects/${PROJECT}/env/${encodeURIComponent(row.id)}`, 'PATCH', { value: recipient });
    assert.equal(updated?.id, row.id, 'PATCH_AMBIGUOUS');
    const next = await snapshot(api, expectedId, diagnostic, pull);
    assert.equal(dedicated(next.rows, 'FEEDBACK_TO_EMAIL').id, row.id, 'PATCH_OWNER');
    const beforeMetadata = rowMetadata(row);
    const afterMetadata = rowMetadata(dedicated(next.rows, 'FEEDBACK_TO_EMAIL'));
    delete beforeMetadata.updatedAt;
    delete afterMetadata.updatedAt;
    assert.deepEqual(afterMetadata, beforeMetadata, 'PATCH_METADATA');
    assert.equal(next.feedback, recipient, 'PATCH_VALUE');
    assert.equal(next.error ?? next.feedback, before.error ?? before.feedback, 'TECHNICAL_DRIFT');
    otherRowsUnchanged(current.rows, next.rows, ['FEEDBACK_TO_EMAIL']);
    current = next;
  }
  window();
  record.phase = 'final-verification';
  assert.equal(current.feedback, recipient);
  Object.assign(record, {
    status: 'feedback-mail-config-updated-redeploy-required',
    checkedAtUtc: new Date(now()).toISOString(),
    finalInventorySha256: fingerprint(inventory(current.rows)),
    feedbackRecipientMatchesRequested: true,
    technicalRecipientPreserved: true,
    deploymentPerformed: false,
    emailSent: false,
    mailboxDeliveryVerified: false,
  });
  save();
}
async function main() {
  const [mode = 'plan', output, expectedId, priorPath, priorSha] = process.argv.slice(2);
  if (mode === 'plan') {
    console.log(
      JSON.stringify({
        status: 'offline-plan',
        modes: ['inspect', 'apply'],
        network: false,
        target: 'Production FEEDBACK_TO_EMAIL only, preserving technical email fallback; managed redeploy required',
      }),
    );
    return;
  }
  assert.ok(['inspect', 'apply'].includes(mode) && output && expectedId, 'ARGUMENTS');
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const record = {
    format: 1,
    mode,
    status: 'initialized',
    phase: 'inputs',
    mutationAttempted: false,
    automaticCompensation: false,
    providerGlobalPauseProven: false,
    projectId: PROJECT,
    teamId: TEAM,
    operatorSourceSha: process.env.GITHUB_SHA || null,
  };
  const save = () => writeFileSync(join(output, 'result.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  save();
  try {
    assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
    assert.equal(process.env.GITHUB_REF, 'refs/heads/codex/feedback-recipient-ops-20261008');
    assert.match(process.env.EXPECTED_OPERATOR_SHA || '', /^[a-f0-9]{40}$/);
    assert.equal(process.env.GITHUB_SHA, process.env.EXPECTED_OPERATOR_SHA);
    assert.equal(expectedId, 'dpl_5iv8aByNMiBH8XedudZkb5NS2st3');
    let prior;
    if (mode === 'apply') {
      const raw = readFileSync(priorPath);
      assert.equal(sha(raw), priorSha);
      prior = JSON.parse(raw);
    }
    const token = process.env.VERCEL_TOKEN;
    assert.ok(typeof token === 'string' && token.length > 0, 'TOKEN');
    const api = async (path, method = 'GET', body) => {
      const url = `https://api.vercel.com/${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM}`;
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      assert.ok(response.ok, 'PROVIDER_HTTP');
      assert.ok(Number(response.headers.get('content-length') || 0) <= 2 * 1024 * 1024, 'BODY_LIMIT');
      const raw = await response.text();
      assert.ok(Buffer.byteLength(raw) <= 2 * 1024 * 1024, 'BODY_LIMIT');
      return JSON.parse(raw);
    };
    const pull = () => freshProductionPull(token);
    await operate(mode, api, expectedId, prior, record, save, undefined, process.env.RELEASE_FEEDBACK_RECIPIENT, pull);
  } catch (error) {
    record.status = 'refused-or-incomplete';
    const firstLine = typeof error?.message === 'string' ? error.message.split('\n')[0] : '';
    const safeCodes = [
      'ROW_COUNT',
      'ABSENCE_ALL_SCOPES',
      'ROW_SCOPE',
      'ROW_MANAGED',
      'ROW_VISIBILITY',
      'ROW_TYPE',
      'ROW_ID_TIME',
      'ADDRESS',
      'OTHER_ENV_DRIFT',
      'ALIAS',
      'ALIAS_PROJECT',
      'ALIAS_OWNER',
      'ALIAS_REDIRECT',
      'BACKEND',
      'SOURCE',
      'INVENTORY',
      'VALUE',
      'DECRYPTION',
      'DECRYPT_METADATA',
      'DECRYPT_SCOPE',
      'DECRYPT_MANAGED',
      'READABLE',
      'SENDER',
      'RESEND_MISSING',
      'FRONTEND_FLAGS',
      'URL',
      'KEY_ALIGNMENT',
      'WINDOW_EXPIRED',
      'PRIOR_STATUS',
      'PRIOR_STALE',
      'FRESH_CAS',
      'CREATE_FAILED',
      'CREATE_AMBIGUOUS',
      'CREATE_OWNER',
      'TECHNICAL_RECIPIENT',
      'PATCH_AMBIGUOUS',
      'PATCH_OWNER',
      'PATCH_METADATA',
      'PATCH_VALUE',
      'TECHNICAL_DRIFT',
      'TOKEN',
      'PROVIDER_HTTP',
      'BODY_LIMIT',
      'SENSITIVE_PULL_REQUIRED',
      'SENSITIVE_PULL_UNREADABLE',
      'OWNER_CHANGED_DURING_PULL',
      'CLI_VERSION',
      'PRIVATE_PULL_FAILED',
    ];
    record.category = safeCodes.includes(firstLine) ? firstLine : 'PRIVATE_DETAILS_WITHHELD';
    record.operatorReinspectionRequired = record.mutationAttempted;
    save();
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: record.status, phase: record.phase, mutationAttempted: record.mutationAttempted }));
}
export function freshProductionPull(token, run = execFileSync) {
  const previousMask = process.umask(0o077);
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), 'trajectory-feedback-pull-'));
    chmodSync(directory, 0o700);
    mkdirSync(join(directory, '.vercel'), { mode: 0o700 });
    writeFileSync(join(directory, '.vercel', 'project.json'), JSON.stringify({ projectId: PROJECT, orgId: TEAM }), { mode: 0o600 });
    const options = {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, VERCEL_ORG_ID: TEAM, VERCEL_PROJECT_ID: PROJECT },
    };
    const version = run('vercel', ['--version'], options);
    assert.equal(String(version).trim(), '60.1.3', 'CLI_VERSION');
    run('vercel', ['pull', '--yes', '--environment=production', '--scope', TEAM, '--token', token], options);
    const file = join(directory, '.vercel', '.env.production.local');
    chmodSync(file, 0o600);
    const parsed = parseEnv(readFileSync(file, 'utf8'));
    // Do not retain unrelated sensitive values, OIDC token, or raw plaintext.
    return Object.fromEntries(
      ['FEEDBACK_TO_EMAIL', 'ERROR_TO_EMAIL'].filter((key) => Object.hasOwn(parsed, key)).map((key) => [key, parsed[key]]),
    );
  } catch {
    throw new Error('PRIVATE_PULL_FAILED');
  } finally {
    process.umask(previousMask);
    if (directory) {
      assert.equal(dirname(resolve(directory)), resolve(tmpdir()), 'PRIVATE_TMP_OWNER');
      assert.ok(basename(directory).startsWith('trajectory-feedback-pull-'), 'PRIVATE_TMP_OWNER');
      rmSync(directory, { recursive: true, force: false });
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
