import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requireDistinctClients, responseSummary } from './session.mjs';

const endpoint = '/functions/v1/product-events';

function requireDenied(response) {
  assert.ok([401, 403].includes(response.status), 'Direct telemetry access must be denied, not merely empty');
  assert.equal(response.body?.code, '42501', 'Expected PostgreSQL permission denial');
}

export async function telemetryPermissions(clients) {
  requireDistinctClients(clients);
  const results = [];
  for (const actor of [clients[0], clients[1], { ...clients[0], label: 'anonymous', anonymous: true }]) {
    const target = clients.find((client) => client.userId !== actor.userId);
    const options = { anonymous: Boolean(actor.anonymous) };
    for (const table of ['product_telemetry_consent', 'product_events']) {
      for (const method of ['GET', 'PATCH', 'DELETE', 'POST']) {
        let data;
        if (method === 'PATCH') {
          data = { user_id: target.userId };
        } else if (method === 'POST') {
          data = { user_id: target.userId, ...(table === 'product_events' ? event() : { enabled: false }) };
        }
        const response = await actor.request(
          method,
          `/rest/v1/${table}${method === 'POST' ? '' : `?user_id=eq.${target.userId}`}`,
          data,
          options,
        );
        requireDenied(response);
        results.push({ actor: actor.label, table, method, ...responseSummary(response), pass: true });
      }
    }
    // Only status is probed, scoped to the two test users. Never call the global retention/purge RPC.
    for (const name of ['process_product_telemetry', 'process_product_telemetry_v1']) {
      const response = await actor.request('POST', `/rest/v1/rpc/${name}`, { p_user_id: target.userId, p_operation: 'status' }, options);
      requireDenied(response);
      results.push({ actor: actor.label, rpc: name, ...responseSummary(response), pass: true });
    }
  }
  return results;
}

export async function telemetryConsent(clients) {
  requireDistinctClients(clients);
  const results = [];
  const actor = clients[0];
  const peer = clients[1];
  const call = (body, options) => actor.request('POST', endpoint, body, options);
  const status = await call({ operation: 'status' });
  if (status.status !== 200) {
    return { available: false, status: responseSummary(status), unverified: ['consent', 'ingestion', 'withdrawal'] };
  }
  const peerBefore = await peer.request('POST', endpoint, { operation: 'status' });
  assert.equal(peerBefore.status, 200, 'Peer status must be readable by its own session');
  for (const [name, response, expected] of [
    ['anonymous status', await call({ operation: 'status' }, { anonymous: true }), 401],
    ['foreign Origin', await call({ operation: 'status' }, { requestOrigin: 'https://example.invalid' }), 403],
    ['forged owner', await call({ operation: 'status', user_id: peer.userId }), 400],
  ]) {
    assert.equal(response.status, expected, name);
    results.push({ name, ...responseSummary(response), pass: true });
  }
  const declined = await call({ operation: 'withdraw' });
  assert.equal(declined.status, 200);
  assert.equal(declined.body.enabled, false);
  results.push({ name: 'withdraw remains available', ...responseSummary(declined), pass: true });
  const granted = await call({ operation: 'grant', revision: declined.body.revision });
  if (granted.status === 503 && granted.body?.error === 'collection_disabled') {
    const disabled = await call({ operation: 'ingest', revision: declined.body.revision, events: [event()] });
    assert.equal(disabled.status, 503);
    assert.equal(disabled.body?.error, 'collection_disabled');
    results.push({ name: 'server-disabled grant and ingestion', ...responseSummary(disabled), pass: true });
    await assertPeerUnchanged(peer, peerBefore.body);
    return {
      available: true,
      collectionEnabled: false,
      results,
      unverified: ['successful ingestion and deduplication; server flag was not changed'],
    };
  }
  assert.equal(granted.status, 200, 'Grant must succeed or explicitly report disabled collection');
  assert.equal(granted.body.enabled, true);
  try {
    const sample = event();
    for (const name of ['ingest', 'repeat same event']) {
      const response = await call({ operation: 'ingest', revision: granted.body.revision, events: [sample] });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.accepted, [sample.event_id]);
      results.push({ name, ...responseSummary(response), pass: true });
    }
  } finally {
    const withdrawn = await call({ operation: 'withdraw' });
    assert.equal(withdrawn.status, 200, 'Always leave test collection disabled');
    assert.equal(withdrawn.body.enabled, false);
  }
  const delayed = await call({ operation: 'ingest', revision: granted.body.revision, events: [event()] });
  assert.ok([403, 409].includes(delayed.status), 'Delayed post-withdrawal ingestion must be rejected');
  results.push({ name: 'delayed ingestion after withdrawal', ...responseSummary(delayed), pass: true });
  await assertPeerUnchanged(peer, peerBefore.body);
  return {
    available: true,
    collectionEnabled: true,
    results,
    storageDeduplicationAndDeletion: 'not observable without operator DB access',
  };
}

function event() {
  return {
    event_id: randomUUID(),
    event_name: 'app_opened',
    schema_version: 1,
    occurred_at: new Date().toISOString(),
    app_version: '0.1.0-qa',
    platform: 'web',
    props: {},
  };
}

async function assertPeerUnchanged(peer, before) {
  const response = await peer.request('POST', endpoint, { operation: 'status' });
  assert.equal(response.status, 200);
  assert.equal(response.body.enabled, before.enabled, 'Peer consent must not change');
  assert.equal(response.body.revision, before.revision, 'Peer consent revision must not change');
  assert.equal(response.body.decision, before.decision, 'Peer decision must not change');
}
