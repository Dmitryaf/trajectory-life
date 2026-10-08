// Root-only finite FROM update. Default/import: zero file/token/network I/O.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const PROJECT = 'prj_O0neiglfpJG0JKq6jBYLJOE6buR4';
export const TEAM = 'team_sZTFAJUNjw3uCHNZarBQgdVb';
export const ROW_ID = 'ZJ0LFv75Neqva6wN';
export const ROW_VERSION = 1785057579614;
export const BRANCH = 'codex/feedback-recipient-ops-20261008';
export const DESIRED = '\u0422\u0440\u0430\u0435\u043a\u0442\u043e\u0440\u0438\u044f <noreply@trajectory-life.ru>';
export const sha = (x) => createHash('sha256').update(x).digest('hex');
function sorted(x) {
  if (Array.isArray(x)) {
    return x.map(sorted);
  }
  if (x && typeof x === 'object') {
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, sorted(x[k])]),
    );
  }
  return x;
}
export const fingerprint = (x) => sha(JSON.stringify(sorted(x)));
const meta = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['value', 'decrypted'].includes(k)));
const blank = (x) => x === undefined || x === null || x === '';
function visibility(r) {
  assert.ok(r.visibility === undefined || r.visibility === 'config', 'CONFIG_VISIBILITY');
  return 'config';
}
export function dedicated(rows, key) {
  const r = rows.filter((x) => x.key === key && x.target?.includes('production'));
  assert.equal(r.length, 1, 'ONE_PRODUCTION_ROW');
  const v = r[0];
  assert.deepEqual(v.target, ['production'], 'PRODUCTION_ONLY');
  assert.ok(
    blank(v.gitBranch) &&
      blank(v.configurationId) &&
      [undefined, null, false].includes(v.system) &&
      (!v.customEnvironmentIds || v.customEnvironmentIds.length === 0),
    'UNMANAGED',
  );
  assert.ok(['plain', 'encrypted'].includes(v.type), 'READABLE_CONFIG');
  visibility(v);
  assert.ok(typeof v.id === 'string' && Number.isFinite(v.updatedAt), 'IDENTITY_VERSION');
  return v;
}
export function dtoSame(list, get) {
  for (const k of ['id', 'key', 'type', 'updatedAt']) {
    assert.equal(get[k], list[k], 'DTO_IDENTITY');
  }
  assert.deepEqual(get.target, list.target, 'DTO_SCOPE');
  visibility(get);
  visibility(list);
  for (const k of ['gitBranch', 'configurationId']) {
    assert.ok(blank(get[k]) && blank(list[k]), 'DTO_OWNER');
  }
  assert.ok([undefined, null, false].includes(get.system), 'DTO_SYSTEM');
  assert.ok(!get.customEnvironmentIds || get.customEnvironmentIds.length === 0, 'DTO_CUSTOM');
}
function compare(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
function visibleKind(r) {
  if (r.visibility === undefined) {
    return 'omitted';
  }
  if (['config', 'secret'].includes(r.visibility)) {
    return r.visibility;
  }
  return 'other';
}
function inventory(rows) {
  return rows.map(meta).sort((a, b) => compare(a.id, b.id));
}
function opaque(rows) {
  return rows
    .map((r) => [r.id, sha(typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? null))])
    .sort((a, b) => compare(a[0], b[0]));
}
export function assertNeighbors(before, after) {
  assert.equal(
    fingerprint(inventory(before.filter((r) => r.id !== ROW_ID))),
    fingerprint(inventory(after.filter((r) => r.id !== ROW_ID))),
    'OTHER_METADATA_DRIFT',
  );
}
export function selectedAfter(before, after) {
  assert.equal(after.id, ROW_ID);
  assert.ok(after.updatedAt > before.updatedAt, 'VERSION_ADVANCE');
  const a = meta(before),
    b = meta(after);
  delete a.updatedAt;
  delete b.updatedAt;
  visibility(a);
  visibility(b);
  a.visibility = 'config';
  b.visibility = 'config';
  assert.deepEqual(b, a, 'SELECTED_METADATA_DRIFT');
}
export function domainProof(p, now) {
  assert.equal(p.status, 'root-verified-resend-sending-domain');
  assert.equal(p.domainId, '1e3e4f6d-b4ff-4b88-8e55-d20565328404');
  assert.equal(p.domain, 'trajectory-life.ru');
  assert.equal(p.verified, true);
  assert.equal(p.operatorApproved, true);
  const age = now - Date.parse(p.checkedAtUtc);
  assert.ok(age >= 0 && age <= 86400000, 'DOMAIN_PROOF_FRESH');
}
export function pins(p) {
  assert.match(p.mainSha, /^[a-f0-9]{40}$/);
  assert.match(p.tree, /^[a-f0-9]{40}$/);
  assert.match(String(p.ciRun), /^[0-9]{10,14}$/);
  assert.match(p.deploymentId, /^dpl_[A-Za-z0-9]+$/);
  assert.match(p.domainProofSha256, /^[a-f0-9]{64}$/);
  assert.match(p.publicKeySha256, /^[a-f0-9]{64}$/);
}
export async function snapshot(api, gh, p, diagnostic = () => {}) {
  pins(p);
  const main = await gh('branches/main');
  assert.equal(main.commit.sha, p.mainSha, 'CURRENT_MAIN');
  assert.equal(main.commit.commit.tree.sha, p.tree, 'CURRENT_TREE');
  const ci = await gh('actions/runs/' + p.ciRun);
  assert.equal(ci.head_sha, p.mainSha);
  assert.equal(ci.head_branch, 'main');
  assert.equal(ci.event, 'push');
  assert.equal(ci.status, 'completed');
  assert.equal(ci.conclusion, 'success');
  for (const host of ['trajectory-app-lilac.vercel.app', 'trajectory-life.ru']) {
    const a = await api('v4/aliases/' + host);
    assert.equal(a.alias, host);
    assert.equal(a.projectId, PROJECT);
    assert.equal(a.deploymentId, p.deploymentId, 'CURRENT_ALIAS');
    assert.ok(!a.redirect);
  }
  const d = await api('v13/deployments/' + p.deploymentId);
  assert.equal(d.id, p.deploymentId);
  assert.equal(d.projectId, PROJECT);
  assert.equal(d.readyState, 'READY');
  assert.equal(d.meta?.backendUrl, 'https://api.trajectory-life.ru');
  assert.equal(d.meta?.sourceSha, p.mainSha);
  const listed = await api('v10/projects/' + PROJECT + '/env');
  const rows = Array.isArray(listed) ? listed : listed.envs;
  assert.ok(Array.isArray(rows) && rows.length && rows.length <= 200 && new Set(rows.map((x) => x.id)).size === rows.length, 'INVENTORY');
  diagnostic({
    selectedRows: rows
      .filter((x) => x.key === 'FEEDBACK_FROM_EMAIL')
      .map((r) => ({
        id: typeof r.id === 'string' ? r.id : null,
        type: ['plain', 'encrypted', 'sensitive', 'secret'].includes(r.type) ? r.type : 'other',
        target: Array.isArray(r.target) ? r.target.map((x) => (['production', 'preview', 'development'].includes(x) ? x : 'other')) : null,
        updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : null,
        visibility: visibleKind(r),
        branchScoped: !blank(r.gitBranch),
        managed: !blank(r.configurationId) || Boolean(r.system) || Boolean(r.customEnvironmentIds?.length),
      })),
  });
  const read = async (key) => {
    const r = dedicated(rows, key);
    if (r.type === 'plain' || r.decrypted === true) {
      assert.equal(typeof r.value, 'string');
      return r.value;
    }
    const v = await api('v1/projects/' + PROJECT + '/env/' + encodeURIComponent(r.id));
    dtoSame(r, v);
    assert.equal(v.decrypted, true);
    assert.equal(typeof v.value, 'string');
    assert.ok(!v.value.includes('[SENSITIVE]'), 'UNREADABLE');
    return v.value;
  };
  const selected = dedicated(rows, 'FEEDBACK_FROM_EMAIL');
  assert.equal(selected.id, ROW_ID);
  assert.equal(selected.type, 'encrypted', 'FIXED_FROM_TYPE');
  const sender = await read('FEEDBACK_FROM_EMAIL');
  const publicValues = {};
  for (const k of ['VITE_FEEDBACK_ENABLED', 'VITE_REQUIRE_AUTH', 'VITE_ENABLE_SIGNUP', 'VITE_PRODUCT_TELEMETRY_ENABLED']) {
    const v = await read(k);
    assert.equal(v, 'true', 'FLAGS');
    publicValues[k] = sha(v);
  }
  for (const k of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    const v = await read(k);
    assert.equal(v, 'https://api.trajectory-life.ru');
    publicValues[k] = sha(v);
  }
  const key = await read('VITE_SUPABASE_ANON_KEY');
  assert.match(key, /^sb_publishable_[A-Za-z0-9_-]+$/);
  assert.equal(await read('SUPABASE_ANON_KEY'), key);
  assert.equal(sha(key), p.publicKeySha256, 'PINNED_PUBLIC_KEY');
  publicValues.PUBLIC_KEY = sha(key);
  assert.ok(
    rows.some((r) => r.key === 'RESEND_API_KEY' && r.target?.includes('production')),
    'RESEND_PRESENT',
  );
  return { rows, selected, sender, publicValues, inventorySha256: fingerprint(inventory(rows)), opaqueSha256: fingerprint(opaque(rows)) };
}
export async function operate(mode, api, gh, p, prior, record, save, sender, domain, now = () => Date.now()) {
  assert.equal(sender, DESIRED, 'EXACT_DESIRED_SENDER');
  domainProof(domain, now());
  pins(p);
  const begin = now();
  const window = () => assert.ok(now() - begin <= 120000, 'WINDOW');
  const diagnostic = (v) => {
    Object.assign(record, v);
    save();
  };
  record.phase = 'current-owner-read';
  save();
  const before = await snapshot(api, gh, p, diagnostic);
  Object.assign(record, {
    pins: p,
    checkedAtUtc: new Date(now()).toISOString(),
    inventorySha256: before.inventorySha256,
    opaqueRepresentationSha256: before.opaqueSha256,
    publicValuesSha256: fingerprint(before.publicValues),
    senderBeforeSha256: sha(before.sender),
    requestedSenderSha256: sha(sender),
    selectedVersion: before.selected.updatedAt,
    unrelatedSecretPlaintextCompared: false,
    providerGlobalPauseProven: false,
  });
  save();
  window();
  if (mode === 'inspect') {
    assert.equal(before.selected.updatedAt, ROW_VERSION, 'FIXED_INITIAL_VERSION');
    assert.equal(before.sender, 'Trajectory <onboarding@resend.dev>', 'FIXED_INITIAL_FROM');
    record.status = 'feedback-sender-current-production-inspected';
    save();
    return;
  }
  assert.equal(mode, 'apply');
  assert.equal(prior.status, 'feedback-sender-current-production-inspected');
  assert.deepEqual(prior.pins, p);
  assert.equal(prior.operatorSourceSha, record.operatorSourceSha);
  assert.equal(prior.inventorySha256, before.inventorySha256);
  assert.equal(prior.publicValuesSha256, fingerprint(before.publicValues));
  assert.equal(prior.senderBeforeSha256, sha(before.sender));
  assert.equal(prior.requestedSenderSha256, sha(sender));
  assert.equal(before.selected.updatedAt, ROW_VERSION);
  assert.equal(before.sender, 'Trajectory <onboarding@resend.dev>');
  const age = now() - Date.parse(prior.checkedAtUtc);
  assert.ok(age >= 0 && age <= 900000, 'PRIOR_FRESH');
  record.phase = 'fresh-visible-cas';
  save();
  const fresh = await snapshot(api, gh, p, diagnostic);
  assert.equal(fresh.inventorySha256, before.inventorySha256, 'FRESH_METADATA_CAS');
  assert.equal(sha(fresh.sender), sha(before.sender), 'FRESH_SELECTED_VALUE');
  assert.deepEqual(fresh.publicValues, before.publicValues);
  window();
  domainProof(domain, now());
  record.phase = 'single-from-value-patch';
  record.mutationAttempted = true;
  save();
  window();
  const updated = await api('v9/projects/' + PROJECT + '/env/' + ROW_ID, 'PATCH', { value: sender });
  assert.equal(updated?.id, ROW_ID, 'PATCH_AMBIGUOUS_NO_RETRY');
  record.phase = 'after-plain-readback';
  save();
  const after = await snapshot(api, gh, p, diagnostic);
  selectedAfter(before.selected, after.selected);
  assertNeighbors(before.rows, after.rows);
  assert.equal(after.sender, sender, 'PLAINTEXT_READBACK');
  assert.deepEqual(after.publicValues, before.publicValues);
  window();
  Object.assign(record, {
    status: 'feedback-sender-production-updated-verified-redeploy-required',
    checkedAtUtc: new Date(now()).toISOString(),
    senderPlaintextReadbackVerified: true,
    selectedVersionAdvanced: true,
    otherOwnerMetadataUnchanged: true,
    knownBackendAndFlagsUnchanged: true,
    opaqueNeighborRepresentationsEqual:
      fingerprint(opaque(before.rows.filter((r) => r.id !== ROW_ID))) === fingerprint(opaque(after.rows.filter((r) => r.id !== ROW_ID))),
    unrelatedHiddenPlaintextEquality: 'NOT_PROVEN',
    deploymentPerformed: false,
    emailSent: false,
    mailboxDeliveryVerified: false,
  });
  save();
}
async function main() {
  const [mode = 'plan', output, pinsPath, domainPath, priorPath, priorSha] = process.argv.slice(2);
  if (mode === 'plan') {
    console.log(JSON.stringify({ status: 'offline-sender-plan', filesRead: 0, liveCalls: 0 }));
    return;
  }
  assert.ok(['inspect', 'apply'].includes(mode) && output && pinsPath && domainPath);
  mkdirSync(output, { mode: 0o700 });
  const record = {
    status: 'initialized',
    phase: 'inputs',
    mode,
    operatorSourceSha: process.env.GITHUB_SHA || null,
    mutationAttempted: false,
    automaticCompensation: false,
  };
  const save = () => writeFileSync(resolve(output, 'result.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  save();
  try {
    assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
    assert.equal(process.env.GITHUB_REF, 'refs/heads/' + BRANCH);
    assert.match(process.env.EXPECTED_OPERATOR_SHA || '', /^[a-f0-9]{40}$/);
    assert.equal(process.env.GITHUB_SHA, process.env.EXPECTED_OPERATOR_SHA);
    const p = JSON.parse(readFileSync(pinsPath));
    const raw = readFileSync(domainPath);
    assert.equal(sha(raw), p.domainProofSha256);
    const domain = JSON.parse(raw);
    let prior;
    if (mode === 'apply') {
      const raw = readFileSync(priorPath);
      assert.equal(sha(raw), priorSha);
      prior = JSON.parse(raw);
    }
    assert.ok(process.env.VERCEL_TOKEN && process.env.GH_TOKEN && process.env.RELEASE_FEEDBACK_SENDER, 'RAM_CREDENTIALS');
    const request = async (url, token, method = 'GET', body) => {
      assert.ok(method === 'GET' || method === 'PATCH');
      if (method === 'PATCH') {
        assert.ok(
          url.startsWith('https://api.vercel.com/v9/projects/' + PROJECT + '/env/' + ROW_ID + '?') &&
            Object.keys(body).join(',') === 'value' &&
            body.value === DESIRED,
          'ONLY_FIXED_FROM_PATCH',
        );
      }
      const r = await fetch(url, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      });
      assert.ok(r.ok, 'API_REQUEST');
      const b = await r.text();
      assert.ok(Buffer.byteLength(b) <= 4 * 1024 * 1024, 'RESPONSE_BOUND');
      return JSON.parse(b);
    };
    const api = (path, method, body) =>
      request('https://api.vercel.com/' + path + '?teamId=' + TEAM, process.env.VERCEL_TOKEN, method, body);
    const gh = (path) => request('https://api.github.com/repos/Dmitryaf/trajectory-life/' + path, process.env.GH_TOKEN);
    await operate(mode, api, gh, p, prior, record, save, process.env.RELEASE_FEEDBACK_SENDER, domain);
  } catch {
    record.status = 'feedback-sender-operation-refused';
    record.failureCategory = 'FIXED_PHASE_PRIVATE_DETAILS_WITHHELD';
    save();
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: record.status, phase: record.phase, mutationAttempted: record.mutationAttempted }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.log(JSON.stringify({ status: 'sender-input-refused', privateDetailsWithheld: true }));
    process.exitCode = 1;
  });
}
