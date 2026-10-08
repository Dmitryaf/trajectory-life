// Finite read-only reconciliation of the actual acknowledged V3 update; never repeat PATCH.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const pins = Object.freeze({
  parentSha256: 'd255f211b58200ad18434cd6d4e8839360b9025693d4b11937b894ad010a1e62',
  failedRawSha256: 'cbbd404d1d30092ea4253ffe89e847841f06e24cd5ffd2b84f8a489586dd1f8a',
  failedRunId: 37795442696,
  previousOperatorSourceSha: '5175b51d50470211a782eee9de338b7d9ea38e32',
  priorInspectRawSha256: '25b7877f987493ca598f9c7c50b915abe8248f454ec2592e66495810b642b3fe',
  beforeInventorySha256: 'fbb7f2bd77263d9261506a47558d8c3194631bafd71d91fc6bca9d78e0d6a7e2',
  recipientId: 'GaUHNETHZAAkFqBN',
  oldUpdatedAt: 1785057478845,
  currentUpdatedAt: 1791470902490,
  requestedRecipientSha256: '8012417da10883032483945efc0beda3a08bc289995ecf307dbe57e045f0da01',
  deploymentId: 'dpl_5iv8aByNMiBH8XedudZkb5NS2st3',
});
function inventory(rows, sha) {
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
      metadata: Object.fromEntries(Object.entries(r).filter(([key]) => !['value', 'decrypted'].includes(key))),
      representationSha256: sha(typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? null)),
    }));
}
export function failedProof(raw, v3) {
  assert.equal(v3.sha(raw), pins.failedRawSha256, 'ACTUAL_FAILED_RAW');
  const q = JSON.parse(raw);
  assert.equal(q.operatorSourceSha, pins.previousOperatorSourceSha, 'ACTUAL_FAILED_SOURCE');
  assert.equal(q.mode, 'apply');
  assert.equal(q.status, 'refused-or-incomplete');
  assert.equal(q.phase, 'change-feedback-recipient-write-only');
  assert.equal(q.category, 'PATCH_METADATA');
  assert.equal(q.mutationAttempted, true);
  assert.equal(q.operatorReinspectionRequired, true);
  assert.equal(q.projectId, v3.PROJECT);
  assert.equal(q.teamId, v3.TEAM);
  assert.equal(q.deploymentId, pins.deploymentId);
  assert.equal(q.inventorySha256, pins.beforeInventorySha256);
  assert.equal(q.requestedRecipientSha256, pins.requestedRecipientSha256);
  const selected = q.selectedRows.filter((r) => r.id === pins.recipientId);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].type, 'sensitive');
  assert.equal(selected[0].visibility, 'secret');
  assert.equal(selected[0].updatedAt, pins.currentUpdatedAt);
  return q;
}
export function reconstruct(rows, v3, expected = pins.beforeInventorySha256) {
  const selected = v3.dedicated(rows, 'FEEDBACK_TO_EMAIL');
  assert.equal(selected.id, pins.recipientId, 'FIXED_ROW');
  assert.equal(selected.type, 'sensitive', 'FIXED_TYPE');
  assert.equal(selected.updatedAt, pins.currentUpdatedAt, 'ACTUAL_CURRENT_VERSION');
  assert.equal(selected.visibility, 'secret', 'ACTUAL_CURRENT_VISIBILITY');
  const before = structuredClone(rows);
  const historical = before.find((r) => r.id === pins.recipientId);
  historical.updatedAt = pins.oldUpdatedAt;
  delete historical.visibility;
  const reconstructedBeforeInventorySha256 = v3.fingerprint(inventory(before, v3.sha));
  const reconstructedBeforeDigestMatches = reconstructedBeforeInventorySha256 === expected;
  return {
    currentInventorySha256: v3.fingerprint(inventory(rows, v3.sha)),
    currentUpdatedAt: selected.updatedAt,
    normalizedVisibility: 'legacy-sensitive-omitted-to-secret',
    reconstructedBeforeInventorySha256,
    reconstructedBeforeDigestMatches,
    allOtherOwnerRowsUnchanged: reconstructedBeforeDigestMatches ? true : null,
  };
}
export async function reconcile(api, raw, v3, save, record, now = () => Date.now()) {
  const failed = failedProof(raw, v3);
  const start = now();
  record.phase = 'readonly-current-owner';
  save();
  const snapshot = await v3.snapshot(
    async (path, method = 'GET', body) => {
      assert.equal(method, 'GET', 'GET_ONLY');
      assert.equal(body, undefined, 'NO_BODY');
      return api(path);
    },
    pins.deploymentId,
    (fields) => {
      Object.assign(record, fields);
      save();
    },
  );
  assert.ok(now() - start >= 0 && now() - start <= 120000, 'READONLY_WINDOW');
  assert.equal(snapshot.publicKeySha256, failed.publicKeySha256, 'CURRENT_PUBLIC_KEY');
  const proof = reconstruct(snapshot.rows, v3);
  // Persist the truthful limited current-owner observation even if historical opaque representations changed.
  Object.assign(record, proof, {
    publicKeySha256: snapshot.publicKeySha256,
    currentOwnerGuardsVerified: true,
    unrelatedSecretPlaintextCompared: false,
  });
  save();
  assert.equal(proof.reconstructedBeforeDigestMatches, true, 'RECONSTRUCTED_PRIOR_INVENTORY_DRIFT');
  Object.assign(record, proof, {
    status: 'root-reconciled-feedback-config-update-redeploy-required',
    phase: 'readonly-reconciled',
    checkedAtUtc: new Date(now()).toISOString(),
    deploymentId: pins.deploymentId,
    actualFailedRunId: pins.failedRunId,
    actualFailedRawSha256: pins.failedRawSha256,
    priorInspectRawSha256: pins.priorInspectRawSha256,
    priorInventorySha256: pins.beforeInventorySha256,
    providerUpdateAcknowledged: true,
    acknowledgementEvidence: 'pinned-V3-control-flow-reached-PATCH_METADATA-after-response-ID-and-version-guards',
    requestedRecipientSha256: pins.requestedRecipientSha256,
    recipientPlaintextReadbackVerified: false,
    errorFallbackUsesFeedback: true,
    mutationAttempted: false,
    deploymentPerformed: false,
    emailSent: false,
    mailboxDeliveryVerified: false,
    providerGlobalPauseProven: false,
  });
  save();
}
async function main() {
  const [mode = 'plan', output, expectedId, priorPath, priorSha] = process.argv.slice(2);
  if (mode === 'plan') {
    console.log(JSON.stringify({ status: 'offline-plan', network: false, mutations: false, modes: ['inspect'] }));
    return;
  }
  assert.ok(
    mode === 'inspect' && output && expectedId === pins.deploymentId && priorPath && priorSha === pins.failedRawSha256,
    'FINITE_READONLY_ARGUMENTS',
  );
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const record = {
    format: 1,
    status: 'initialized',
    phase: 'inputs',
    mutationAttempted: false,
    operatorSourceSha: process.env.GITHUB_SHA || null,
  };
  const save = () => writeFileSync(join(output, 'result.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  save();
  try {
    assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
    assert.equal(process.env.GITHUB_REF, 'refs/heads/codex/feedback-recipient-ops-20261008');
    assert.match(process.env.EXPECTED_OPERATOR_SHA || '', /^[a-f0-9]{40}$/);
    assert.equal(process.env.GITHUB_SHA, process.env.EXPECTED_OPERATOR_SHA);
    const parent = new URL('./feedback-mail-v3-frozen.mjs', import.meta.url);
    const parentBytes = readFileSync(parent);
    // Verify bytes before import; frozen V3 default entrypoint does not run as an imported module.
    const { createHash } = await import('node:crypto');
    assert.equal(createHash('sha256').update(parentBytes).digest('hex'), pins.parentSha256, 'PARENT_BYTES');
    const v3 = await import(parent);
    const raw = readFileSync(priorPath);
    failedProof(raw, v3);
    const token = process.env.VERCEL_TOKEN;
    assert.ok(typeof token === 'string' && token.length > 0, 'TOKEN');
    const api = async (path) => {
      const response = await fetch(`https://api.vercel.com/${path}${path.includes('?') ? '&' : '?'}teamId=${v3.TEAM}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      assert.ok(response.ok, 'PROVIDER_HTTP');
      assert.ok(Number(response.headers.get('content-length') || 0) <= 2 * 1024 ** 2, 'BODY_LIMIT');
      const b = await response.text();
      assert.ok(Buffer.byteLength(b) <= 2 * 1024 ** 2, 'BODY_LIMIT');
      return JSON.parse(b);
    };
    await reconcile(api, raw, v3, save, record);
  } catch {
    record.status = 'readonly-reconciliation-refused';
    record.privateDetailsWithheld = true;
    save();
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: record.status, phase: record.phase, mutationAttempted: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
