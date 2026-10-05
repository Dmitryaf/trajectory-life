import assert from 'node:assert/strict';
import test from 'node:test';
import { assertClientBuildEnvironment } from './build-environment.mjs';

const ref = 'stagingproject';
const publicKey = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const valid = {
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: publicKey({ role: 'anon', ref }),
  VITE_REQUIRE_AUTH: 'true',
  RESEND_API_KEY: '[SENSITIVE]',
};

test('public client settings may coexist with unreadable server secrets', () => {
  assert.doesNotThrow(() => assertClientBuildEnvironment(valid, ref));
  assert.doesNotThrow(() => assertClientBuildEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: 'sb_publishable_example' }, ref));
});

test('redacted client settings stop the build before deployment', () => {
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_REQUIRE_AUTH']) {
    assert.throws(() => assertClientBuildEnvironment({ ...valid, [name]: '[SENSITIVE]' }, ref), /not readable/);
  }
});

test('missing, wrong-environment and privileged client configuration is rejected', () => {
  for (const patch of [
    { VITE_SUPABASE_URL: undefined },
    { VITE_SUPABASE_URL: 'https://productionproject.supabase.co' },
    { VITE_SUPABASE_ANON_KEY: '' },
    { VITE_SUPABASE_ANON_KEY: 'sb_secret_example' },
    { VITE_SUPABASE_ANON_KEY: 'invalid.invalid.invalid' },
    { VITE_SUPABASE_ANON_KEY: publicKey({ role: 'service_role', ref }) },
    { VITE_SUPABASE_ANON_KEY: publicKey({ role: 'anon', ref: 'productionproject' }) },
    { VITE_REQUIRE_AUTH: 'false' },
  ]) {
    assert.throws(() => assertClientBuildEnvironment({ ...valid, ...patch }, ref));
  }
});
