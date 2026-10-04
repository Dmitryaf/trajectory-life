// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role supabase_auth_admin;');
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261002000000_retire_beta_signup_gate.sql', import.meta.url), 'utf8'));
});
afterAll(async () => db.close());

describe('retired beta signup gate', () => {
  it('allows Auth to create users without invitations or a total-cohort limit', async () => {
    await db.exec('set role supabase_auth_admin');
    try {
      const result = await db.query<{ result: unknown }>(
        `select public.hook_require_beta_invite(jsonb_build_object('user', jsonb_build_object('email', 'synthetic@example.test'))) as result
         from generate_series(1, 101)`,
      );
      expect(result.rows).toHaveLength(101);
      expect(result.rows.every((row) => JSON.stringify(row.result) === '{}')).toBe(true);
    } finally {
      await db.exec('reset role');
    }
  });

  it.each(['anon', 'authenticated'])('does not grant the %s role direct execution of the Auth hook', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select public.hook_require_beta_invite('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});
