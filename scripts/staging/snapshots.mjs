import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import { requireDistinctClients, responseSummary } from './session.mjs';
import { addResult, removeResult, open } from './ui-helpers.mjs';

const table = '/rest/v1/trajectory_snapshots';
const hash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

export async function syncMeta(client) {
  return client.page.evaluate((id) => JSON.parse(localStorage.getItem(`trajectory:cloud-sync:${id}`) || 'null'), client.userId);
}

export async function waitSynced(client) {
  await client.page.bringToFront();
  await expect
    .poll(
      async () => {
        const meta = await syncMeta(client);
        return Boolean(meta && meta.lastCloudRevision > 0 && !meta.pending && !meta.conflict && !meta.error);
      },
      { timeout: 45_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
}

async function own(client) {
  const response = await client.request('GET', `${table}?user_id=eq.${client.userId}&select=user_id,payload,revision,updated_at`);
  assert.equal(response.status, 200, 'Owner read must succeed');
  assert.equal(response.body.length, 1, 'Existing owner snapshot is required');
  return response.body[0];
}

async function unchanged(owner, baseline) {
  assert.equal(hash(await own(owner)), hash(baseline), 'Owner snapshot changed after forbidden request');
}

function denied(response, requiresError) {
  if (requiresError) {
    assert.ok([401, 403].includes(response.status), 'Expected permission denial');
    assert.equal(response.body?.code, '42501', 'Must be policy denial, not a uniqueness/validation error');
  } else {
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, [], 'Foreign read/update/delete must affect no rows');
  }
}

async function crossChecks(actor, target, anonymous = false) {
  const baseline = await own(target);
  const checks = [];
  for (const method of ['GET', 'PATCH', 'DELETE', 'POST']) {
    const path = method === 'POST' ? table : `${table}?user_id=eq.${target.userId}`;
    let data;
    if (method === 'PATCH') {
      data = { revision: baseline.revision + 100000 };
    } else if (method === 'POST') {
      data = { user_id: target.userId, payload: baseline.payload, revision: baseline.revision + 100000 };
    }
    const response = await actor.request(method, path, data, { anonymous });
    denied(response, method === 'POST');
    await unchanged(target, baseline);
    checks.push({
      actor: anonymous ? 'anonymous' : actor.label,
      target: target.label,
      method,
      ...responseSummary(response),
      ownerUnchanged: true,
    });
  }
  return checks;
}

async function ownershipChecks(actor, target) {
  const before = await own(actor);
  const baseline = await own(target);
  const upsert = await actor.request(
    'POST',
    `${table}?on_conflict=user_id`,
    { user_id: target.userId, payload: baseline.payload, revision: baseline.revision + 100000 },
    { prefer: 'resolution=merge-duplicates,return=representation' },
  );
  denied(upsert, true);
  await unchanged(target, baseline);
  const reassign = await actor.request('PATCH', `${table}?user_id=eq.${actor.userId}`, { user_id: target.userId });
  denied(reassign, true);
  await unchanged(actor, before);
  await unchanged(target, baseline);
  return [
    { actor: actor.label, operation: 'foreign UPSERT', ...responseSummary(upsert), ownerUnchanged: true },
    { actor: actor.label, operation: 'reassign owner', ...responseSummary(reassign), bothUnchanged: true },
  ];
}

export async function snapshotRls(clients) {
  requireDistinctClients(clients);
  const fixture = `QA RLS ${randomUUID()}`;
  const prepared = [];
  const checks = [];
  try {
    for (const client of clients) {
      await addResult(client, fixture, 'Disposable staging isolation probe');
      prepared.push(client);
      await waitSynced(client);
      await client.page.goto('about:blank');
    }
    for (const actor of clients) {
      const target = clients.find((candidate) => candidate !== actor);
      const before = await own(actor);
      const positive = await actor.request('PATCH', `${table}?user_id=eq.${actor.userId}`, { revision: before.revision + 1 });
      assert.equal(positive.status, 200);
      assert.equal(positive.body.length, 1);
      checks.push({ actor: actor.label, operation: 'own read/update', ...responseSummary(positive) });
      const all = await actor.request('GET', `${table}?select=user_id`);
      assert.equal(all.status, 200);
      assert.deepEqual(all.body, [{ user_id: actor.userId }]);
      checks.push({ actor: actor.label, operation: 'unfiltered owner-only read', ...responseSummary(all) });
      checks.push(...(await crossChecks(actor, target)), ...(await ownershipChecks(actor, target)));
    }
    for (const target of clients) {
      checks.push(...(await crossChecks(target, target, true)));
    }
    return { passed: checks.length, checks };
  } finally {
    // Never clear a whole account or overwrite a snapshot as test cleanup.
    for (const client of prepared) {
      await removeResult(client, fixture);
      await waitSynced(client);
    }
  }
}

async function edit(client, title, note) {
  if (new URL(client.page.url()).pathname !== '/results') {
    await open(client, '/results');
  }
  await client.page.getByPlaceholder('Поиск по итогам').fill(title);
  const item = client.page.locator('.result-item').filter({ hasText: title });
  await item.getByRole('button', { name: 'Редактировать итог' }).click();
  await client.page.getByPlaceholder('Что произошло, почему это важно или какой контекст стоит сохранить').fill(note);
  await client.page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(item).toContainText(note);
}

export async function twoDeviceSync(client) {
  const title = `QA sync ${randomUUID()}`;
  let secondContext;
  let second;
  try {
    await addResult(client, title, 'Initial server copy');
    await waitSynced(client);
    const state = await client.page.context().storageState();
    const authOnly = {
      cookies: [],
      origins: state.origins
        .filter((entry) => entry.origin === client.origin)
        .map((entry) => ({
          origin: entry.origin,
          localStorage: entry.localStorage.filter((item) => /^sb-.*-auth-token$/.test(item.name)),
        })),
    };
    secondContext = await client.page.context().browser().newContext({ storageState: authOnly });
    second = { ...client, page: await secondContext.newPage() };
    await open(second, '/results');
    const item = second.page.locator('.result-item').filter({ hasText: title });
    await second.page.getByPlaceholder('Поиск по итогам').fill(title);
    await expect(item).toContainText('Initial server copy', { timeout: 30_000 });
    await waitSynced(second);
    await second.page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 });
    await secondContext.setOffline(true);
    await edit(second, title, 'Offline device B');
    await second.page.reload({ waitUntil: 'domcontentloaded' });
    await second.page.getByPlaceholder('Поиск по итогам').fill(title);
    await expect(item).toContainText('Offline device B');
    await edit(client, title, 'Online device A');
    await waitSynced(client);
    await secondContext.setOffline(false);
    await second.page.bringToFront();
    await expect.poll(async () => (await syncMeta(second))?.conflict, { timeout: 45_000 }).toBe(true);
    await open(second, '/settings#data-settings');
    const cloudChoice = second.page.getByRole('button', { name: 'Загрузить облачную версию', exact: true });
    await expect(cloudChoice).toBeVisible();
    second.page.once('dialog', (dialog) => dialog.dismiss());
    await cloudChoice.click();
    await second.page.reload();
    await expect(cloudChoice).toBeVisible({ timeout: 30_000 });
    second.page.once('dialog', (dialog) => dialog.accept());
    await cloudChoice.click();
    await waitSynced(second);
    await open(second, '/results');
    await second.page.getByPlaceholder('Поиск по итогам').fill(title);
    await expect(item).toContainText('Online device A');
    return {
      newLocalDatabaseReceivedData: true,
      offlineReload: true,
      conflict: true,
      cancelAndReloadPreservedConflict: true,
      explicitCloudChoice: true,
    };
  } finally {
    if (secondContext) {
      await secondContext.setOffline(false);
      await secondContext.close();
    }
    await removeResult(client, title);
    await waitSynced(client);
  }
}
