// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin; create role supabase_admin;
    create schema auth;
    create table auth.audit_log_entries (id uuid primary key, created_at timestamptz, payload jsonb);
    insert into auth.audit_log_entries
      select md5(i::text)::uuid, now() - interval '91 days', '{"synthetic":true}'::jsonb
      from generate_series(1,10001) as i;
    insert into auth.audit_log_entries values
      ('ffffffff-ffff-4fff-8fff-ffffffffffff', now() - interval '89 days', '{"synthetic":true}'),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', null, '{"synthetic":true}');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261009010000_auth_audit_retention.sql', import.meta.url), 'utf8'));
});
afterAll(async () => db.close());

describe('Auth security audit retention', () => {
  it.each(['anon', 'authenticated', 'supabase_auth_admin'])('does not allow %s to erase the security journal', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query('select private.purge_auth_audit()')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('deletes only entries older than 90 days in bounded batches and tolerates repeated runs', async () => {
    await db.exec('set role supabase_admin');
    try {
      for (const expected of [10000, 1, 0]) {
        expect((await db.query<{ deleted: number }>('select private.purge_auth_audit() as deleted')).rows).toEqual([{ deleted: expected }]);
      }
    } finally {
      await db.exec('reset role');
    }
    expect((await db.query<{ id: string }>('select id from auth.audit_log_entries order by id')).rows).toEqual([
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
      { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    ]);
  });
});
