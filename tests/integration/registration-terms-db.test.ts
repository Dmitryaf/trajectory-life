// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentTermsAcceptance, TERMS_VERSION, PRIVACY_POLICY_VERSION } from '@/model/legalDocuments';

let db: PGlite;
const existing = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
    insert into auth.users (id) values ('${existing}');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261009000000_registration_terms.sql', import.meta.url), 'utf8'));
});
afterAll(async () => db.close());

describe('registration terms audit', () => {
  it('supports a preserved non-superuser hook owner when another operator installs the validator', async () => {
    const separateOwnerDb = new PGlite();
    try {
      await separateOwnerDb.exec(`create role anon; create role authenticated; create role supabase_auth_admin;
        create role supabase_admin superuser;
        create role existing_auth_hook_owner;
        create schema auth;
        create schema private authorization existing_auth_hook_owner;
        create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
        create function public.hook_require_beta_invite(event jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
        alter function public.hook_require_beta_invite(jsonb) owner to existing_auth_hook_owner;
        set role supabase_admin;`);
      await separateOwnerDb.exec(
        readFileSync(new URL('../../supabase/migrations/20261009000000_registration_terms.sql', import.meta.url), 'utf8'),
      );
      await separateOwnerDb.exec('set role supabase_auth_admin');
      await expect(separateOwnerDb.query("select public.hook_require_beta_invite('{}'::jsonb)")).rejects.toThrow(/permission denied/);
      await separateOwnerDb.exec('reset role');
      await separateOwnerDb.exec(
        readFileSync(new URL('../../supabase/migrations/20261009020000_registration_terms_hook_permissions.sql', import.meta.url), 'utf8'),
      );
      await separateOwnerDb.exec('set role supabase_auth_admin');
      const rejected = await separateOwnerDb.query<{ result: { error: { http_code: number } } }>(
        "select public.hook_require_beta_invite('{}'::jsonb) as result",
      );
      expect(rejected.rows[0].result.error.http_code).toBe(400);
      const accepted = await separateOwnerDb.query<{ result: unknown }>('select public.hook_require_beta_invite($1::jsonb) as result', [
        JSON.stringify({ user: { user_metadata: { terms_acceptance: currentTermsAcceptance() } } }),
      ]);
      expect(accepted.rows[0].result).toEqual({});
      await separateOwnerDb.exec('reset role; set role anon');
      await expect(separateOwnerDb.query("select private.valid_registration_terms('{}'::jsonb)")).rejects.toThrow(/permission denied/);
      await expect(separateOwnerDb.query('select * from private.registration_terms_acceptance')).rejects.toThrow(/permission denied/);
    } finally {
      await separateOwnerDb.close();
    }
  });

  it('does not invent acceptance for existing accounts', async () => {
    expect((await db.query('select * from private.registration_terms_acceptance')).rows).toEqual([]);
    expect((await db.query('select * from auth.users')).rows).toHaveLength(1);
  });

  it.each([
    null,
    {},
    { ...currentTermsAcceptance(), accepted: false },
    { ...currentTermsAcceptance(), accepted: 'true' },
    { ...currentTermsAcceptance(), terms_version: 'old-version' },
    { ...currentTermsAcceptance(), privacy_policy_version: 'old-version' },
    { ...currentTermsAcceptance(), accepted_at: '2000-01-01' },
  ])('rejects absent, invalid or client-timed acceptance %j', async (acceptance) => {
    await db.exec('set role supabase_auth_admin');
    try {
      const result = await db.query<{ result: { error: { http_code: number } } }>(
        'select public.hook_require_beta_invite($1::jsonb) as result',
        [JSON.stringify({ user: { user_metadata: { terms_acceptance: acceptance } } })],
      );
      expect(result.rows[0].result.error.http_code).toBe(400);
    } finally {
      await db.exec('reset role');
    }
    await expect(
      db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)', [
        first,
        JSON.stringify({ terms_acceptance: acceptance }),
      ]),
    ).rejects.toThrow(/terms acceptance/);
    expect((await db.query('select * from auth.users where id = $1', [first])).rows).toEqual([]);
  });

  it('accepts the exact frontend versions and records server time separately from editable user metadata', async () => {
    const metadata = { terms_acceptance: currentTermsAcceptance() };
    const hook = await db.query<{ result: unknown }>('select public.hook_require_beta_invite($1::jsonb) as result', [
      JSON.stringify({ user: { user_metadata: metadata } }),
    ]);
    expect(hook.rows[0].result).toEqual({});
    await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $3::jsonb), ($2, $3::jsonb)', [
      first,
      second,
      JSON.stringify(metadata),
    ]);
    const rows = (
      await db.query<{ user_id: string; terms_version: string; privacy_policy_version: string; accepted_at: Date }>(
        'select * from private.registration_terms_acceptance order by user_id',
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: first, terms_version: TERMS_VERSION, privacy_policy_version: PRIVACY_POLICY_VERSION });
    expect(rows[0].accepted_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
    await db.query("update auth.users set raw_user_meta_data = '{}'::jsonb where id = $1", [first]);
    expect((await db.query('select * from private.registration_terms_acceptance order by user_id')).rows).toEqual(rows);
  });

  it.each(['anon', 'authenticated'])('prevents %s from reading or replacing acceptance and invoking the hook', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query('select * from private.registration_terms_acceptance')).rejects.toThrow(/permission denied/);
      await expect(db.query('delete from private.registration_terms_acceptance')).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.hook_require_beta_invite('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('deletes only the removed account acceptance', async () => {
    await db.query('delete from auth.users where id = $1', [first]);
    expect((await db.query<{ user_id: string }>('select user_id from private.registration_terms_acceptance')).rows).toEqual([
      { user_id: second },
    ]);
  });
});
