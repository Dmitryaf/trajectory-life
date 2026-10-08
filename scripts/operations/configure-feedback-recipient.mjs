import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
    fingerprint(inventory(before.filter((r) => !selected.includes(r.id)))),
    fingerprint(inventory(after.filter((r) => !selected.includes(r.id)))),
    'OTHER_ENV_DRIFT',
  );
}
export async function snapshot(api, expectedId, diagnostic = () => {}) {
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
  const recipientRow = dedicated(rows, 'FEEDBACK_TO_EMAIL');
  assert.equal(recipientRow.id, 'GaUHNETHZAAkFqBN', 'FIXED_RECIPIENT_ID');
  assert.equal(recipientRow.type, 'sensitive', 'FIXED_RECIPIENT_TYPE');
  assert.equal(dedicated(rows, 'ERROR_TO_EMAIL', false), null, 'ERROR_TO_EXPECTED_ABSENT');
  const read = async (key, required = true) => {
    const r = dedicated(rows, key, required);
    if (!r) {
      return null;
    }
    assert.notEqual(r.type, 'sensitive', 'UNEXPECTED_SENSITIVE_READ');
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
  return { rows, recipientRow, errorFallbackUsesFeedback: true, publicKeySha256: sha(browserKey) };
}
export async function operate(mode, api, expectedId, prior, record, save, now = () => Date.now(), recipient) {
  address(recipient);
  const start = now();
  const window = () => assert.ok(now() - start <= 120_000, 'WINDOW_EXPIRED');
  record.phase = 'owner-read';
  save();
  const diagnostic = (fields) => {
    Object.assign(record, fields);
    save();
  };
  const before = await snapshot(api, expectedId, diagnostic);
  Object.assign(record, {
    checkedAtUtc: new Date(now()).toISOString(),
    deploymentId: expectedId,
    inventorySha256: fingerprint(inventory(before.rows)),
    requestedRecipientSha256: sha(recipient),
    publicKeySha256: before.publicKeySha256,
    recipientWriteOnly: true,
    errorFallbackUsesFeedback: true,
    recipientPlaintextReadbackVerified: false,
    unrelatedSecretPlaintextCompared: false,
  });
  save();
  window();
  if (mode === 'inspect') {
    record.status = 'feedback-mail-config-inspected-write-only';
    save();
    return;
  }
  assert.equal(mode, 'apply');
  assert.equal(prior.status, 'feedback-mail-config-inspected-write-only', 'PRIOR_STATUS');
  assert.equal(prior.deploymentId, expectedId);
  assert.equal(prior.inventorySha256, record.inventorySha256, 'PRIOR_INVENTORY');
  assert.equal(prior.requestedRecipientSha256, sha(recipient));
  assert.equal(prior.operatorSourceSha, record.operatorSourceSha);
  assert.equal(prior.recipientWriteOnly, true);
  assert.equal(prior.errorFallbackUsesFeedback, true);
  assert.ok(now() - Date.parse(prior.checkedAtUtc) >= 0 && now() - Date.parse(prior.checkedAtUtc) <= 900_000, 'PRIOR_STALE');
  const fresh = await snapshot(api, expectedId, diagnostic);
  assert.equal(fingerprint(inventory(fresh.rows)), fingerprint(inventory(before.rows)), 'FRESH_CAS');
  window();
  const row = fresh.recipientRow;
  record.phase = 'change-feedback-recipient-write-only';
  record.mutationAttempted = true;
  save();
  window();
  const updated = await api(`v9/projects/${PROJECT}/env/${encodeURIComponent(row.id)}`, 'PATCH', { value: recipient });
  assert.equal(updated?.id, row.id, 'PATCH_AMBIGUOUS');
  const after = await snapshot(api, expectedId, diagnostic);
  assert.equal(after.recipientRow.id, row.id, 'PATCH_OWNER');
  assert.ok(after.recipientRow.updatedAt > row.updatedAt, 'PATCH_VERSION_NOT_ADVANCED');
  const oldMeta = rowMetadata(row),
    newMeta = rowMetadata(after.recipientRow);
  delete oldMeta.updatedAt;
  delete newMeta.updatedAt;
  assert.deepEqual(newMeta, oldMeta, 'PATCH_METADATA');
  otherRowsUnchanged(before.rows, after.rows, [row.id]);
  window();
  Object.assign(record, {
    status: 'config-update-acknowledged-redeploy-required',
    phase: 'final-verification',
    checkedAtUtc: new Date(now()).toISOString(),
    finalInventorySha256: fingerprint(inventory(after.rows)),
    providerUpdateAcknowledged: true,
    selectedRowVersionAdvanced: true,
    recipientPlaintextReadbackVerified: false,
    errorToEmailRemainsAbsent: true,
    errorFallbackUsesFeedback: true,
    otherOwnerRowsUnchanged: true,
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
        target: 'Fixed Production sensitive FEEDBACK_TO_EMAIL write-only; ERROR_TO_EMAIL stays absent; managed redeploy required',
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
    await operate(mode, api, expectedId, prior, record, save, undefined, process.env.RELEASE_FEEDBACK_RECIPIENT);
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
      'FIXED_RECIPIENT_ID',
      'FIXED_RECIPIENT_TYPE',
      'ERROR_TO_EXPECTED_ABSENT',
      'UNEXPECTED_SENSITIVE_READ',
      'PRIOR_INVENTORY',
      'PATCH_VERSION_NOT_ADVANCED',
    ];
    record.category = safeCodes.includes(firstLine) ? firstLine : 'PRIVATE_DETAILS_WITHHELD';
    record.operatorReinspectionRequired = record.mutationAttempted;
    save();
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: record.status, phase: record.phase, mutationAttempted: record.mutationAttempted }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
