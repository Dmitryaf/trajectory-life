// @vitest-environment node
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db: PGlite;
async function process(owner: string, operation: string, revision: string | null = null, events: unknown[] = []) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    'select public.process_product_telemetry($1, $2, $3, $4::jsonb) as result',
    [owner, operation, revision, JSON.stringify(events)],
  );
  return result.rows[0].result;
}
function event() {
  return {
    event_id: randomUUID(),
    event_name: 'app_opened',
    schema_version: 1,
    occurred_at: new Date(Date.now() + 1000).toISOString(),
    app_version: '0.1.0',
    platform: 'web',
    props: {},
  };
}
async function grant(owner = a) {
  const consent = await process(owner, 'status');
  return process(owner, 'grant', consent.revision as string);
}
async function count(table: string) {
  const result = await db.query<{ count: number }>(`select count(*)::integer as count from public.${table}`);
  return result.rows[0].count;
}

describe('telemetry migration on PostgreSQL (PGlite)', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      'create schema auth; create table auth.users(id uuid primary key, created_at timestamptz default now()); create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;',
    );
    await db.exec(readFileSync('supabase/migrations/20260912000000_product_telemetry.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20260912010000_telemetry_consent_experience.sql', 'utf8'));
  }, 30_000);
  beforeEach(async () => {
    await db.exec('reset role; truncate auth.users cascade;');
    await db.query('insert into auth.users(id) values ($1), ($2)', [a, b]);
  });
  afterAll(async () => {
    await db.close();
  });

  it('denies anonymous/authenticated CRUD and execution, with RLS even after an accidental select grant', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of ['product_events', 'product_telemetry_consent']) {
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`update public.${table} set user_id = $1`, [b])).rejects.toThrow(/permission denied/);
      }
      await expect(process(a, 'status')).rejects.toThrow(/permission denied/);
      await expect(db.query('select public.purge_product_events()')).rejects.toThrow(/permission denied/);
      await db.exec('reset role');
    }
    const consent = await grant();
    await process(a, 'ingest', consent.revision as string, [event()]);
    await db.exec('grant select on public.product_events to authenticated; set role authenticated;');
    expect((await db.query('select * from public.product_events')).rows).toEqual([]);
    await db.exec('reset role; revoke select on public.product_events from authenticated;');
  });

  it('reserves one account-wide first offer and one delayed reminder, and never asks after decline', async () => {
    const initial = await process(a, 'status');
    expect(initial.decision).toBe('undecided');
    expect(await process(a, 'offer', initial.revision as string)).toMatchObject({ offered: true, enabled: false });
    expect(await process(a, 'offer', initial.revision as string)).toMatchObject({ offered: false });
    const later = await process(a, 'snooze');
    expect(later).toMatchObject({ decision: 'snoozed', enabled: false, reminder_count: 0 });
    expect(await process(a, 'reminder', later.revision as string)).toMatchObject({ offered: false });
    await db.exec(
      "update public.product_telemetry_consent set first_offered_at = now() - interval '8 days', snoozed_until = now() - interval '1 day'",
    );
    expect(await process(a, 'reminder', later.revision as string)).toMatchObject({ offered: true, reminder_count: 1 });
    expect(await process(a, 'reminder', later.revision as string)).toMatchObject({ offered: false, reminder_count: 1 });
    const declined = await process(a, 'withdraw');
    expect(declined.decision).toBe('declined');
    expect(await process(a, 'offer', declined.revision as string)).toMatchObject({ offered: false });
    expect(await process(a, 'reminder', declined.revision as string)).toMatchObject({ offered: false });
    expect(await count('product_events')).toBe(0);
    expect(await process(a, 'grant', declined.revision as string)).toMatchObject({ enabled: true, decision: 'allowed' });
  });

  it('starts disabled and deduplicates stable ids within each owner', async () => {
    const disabled = await process(a, 'status');
    expect(disabled.enabled).toBe(false);
    expect(await process(a, 'ingest', disabled.revision as string, [event()])).toMatchObject({ status: 403 });
    const ca = await grant();
    const cb = await grant(b);
    const e = event();
    await db.exec('set role service_role');
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await process(a, 'ingest', ca.revision as string, [e])).toEqual({ accepted: [e.event_id] });
    }
    await process(b, 'ingest', cb.revision as string, [e]);
    await db.exec('reset role');
    expect(await count('product_events')).toBe(2);
  });

  it('withdraws atomically, rejects a delayed grant/ingestion, and starts a new observation epoch', async () => {
    const consent = await grant();
    await process(a, 'ingest', consent.revision as string, [event()]);
    const withdrawn = await process(a, 'withdraw');
    expect(withdrawn).toMatchObject({ enabled: false, observation_started_at: null });
    expect(await count('product_events')).toBe(0);
    expect(await process(a, 'grant', consent.revision as string)).toMatchObject({ status: 409 });
    expect(await process(a, 'ingest', consent.revision as string, [event()])).toMatchObject({ status: 409 });
    const renewed = await process(a, 'grant', withdrawn.revision as string);
    expect(renewed.revision).not.toBe(consent.revision);
    const beforeConsent = { ...event(), occurred_at: '2026-01-01T00:00:00.000Z' };
    expect(await process(a, 'ingest', renewed.revision as string, [event(), beforeConsent])).toMatchObject({ status: 400 });
    expect(await count('product_events')).toBe(0);
  });

  it('limits authenticated requests on the server but always permits withdrawal', async () => {
    const consent = await grant();
    for (let attempt = 0; attempt < 28; attempt++) {
      await process(a, 'status');
    }
    expect(await process(a, 'ingest', consent.revision as string, [event()])).toMatchObject({ status: 429 });
    expect(await process(a, 'withdraw')).toMatchObject({ enabled: false });
  });

  it('purges old raw events and cascades all identified telemetry on auth deletion', async () => {
    const consent = await grant();
    await process(a, 'ingest', consent.revision as string, [event(), event()]);
    await db.exec(
      "update public.product_events set received_at = now() - interval '91 days' where id = (select min(id) from public.product_events)",
    );
    expect((await db.query('select public.purge_product_events() as removed')).rows).toEqual([{ removed: 1 }]);
    await db.query('delete from auth.users where id = $1', [a]);
    expect(await count('product_events')).toBe(0);
    expect(await count('product_telemetry_consent')).toBe(0);
    await expect(process(a, 'ingest', consent.revision as string, [event()])).rejects.toThrow(/foreign key/);
  });

  it('executes operator reports with mature W4/W8 denominators and observation-based candidates', async () => {
    await grant(a);
    await grant(b);
    await db.query("update public.product_telemetry_consent set observation_started_at = now() - interval '64 days' where user_id = $1", [
      a,
    ]);
    await db.query("update public.product_telemetry_consent set observation_started_at = now() - interval '10 days' where user_id = $1", [
      b,
    ]);
    await db.exec("update auth.users set created_at = now() - interval '100 days'");
    for (const [daysAgo, name] of [
      [63, 'first_use_overview_viewed'],
      [33, 'app_opened'],
      [6, 'app_opened'],
    ] as const) {
      await db.query(
        "insert into public.product_events(user_id,event_id,event_name,schema_version,occurred_at,app_version,platform,props) values ($1,$2,$3,1,now()-$4*interval '1 day','0.1.0','web','{}')",
        [a, randomUUID(), name, daysAgo],
      );
    }
    const results = await db.exec(readFileSync('supabase/queries/product-observability.sql', 'utf8'));
    const retention = results.flatMap((result) => result.rows).filter((row) => 'week' in row && !('name' in row));
    expect(retention.find((row) => row.week === 4)).toMatchObject({ mature_accounts: 1, returning_accounts: 1 });
    expect(retention.find((row) => row.week === 8)).toMatchObject({ mature_accounts: 1, returning_accounts: 1 });
    expect(retention.find((row) => row.week === 0)).toMatchObject({ mature_accounts: 2 });
    expect(results.at(-1)?.rows).toContainEqual(
      expect.objectContaining({
        name: 'reconstructed_overview',
        candidate_present: true,
        week: 8,
        mature_accounts: 1,
        returning_accounts: 1,
      }),
    );
  });
});
