import assert from 'node:assert/strict';
import test from 'node:test';
import { assertClientBuildEnvironment } from './build-environment.mjs';
import { releaseTargets } from './release-policy.mjs';

const ref = 'stagingproject';
const target = { projectRef: ref };
const publicKey = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const valid = {
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: publicKey({ role: 'anon', ref }),
  VITE_REQUIRE_AUTH: 'true',
  RESEND_API_KEY: '[SENSITIVE]',
};

test('public client settings may coexist with unreadable server secrets', () => {
  assert.doesNotThrow(() => assertClientBuildEnvironment(valid, target));
  assert.doesNotThrow(() => assertClientBuildEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: 'sb_publishable_example' }, target));
});

test('redacted client settings stop the build before deployment', () => {
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_REQUIRE_AUTH']) {
    assert.throws(() => assertClientBuildEnvironment({ ...valid, [name]: '[SENSITIVE]' }, target), /not readable/);
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
    assert.throws(() => assertClientBuildEnvironment({ ...valid, ...patch }, target));
  }
});

test('production accepts its pinned VPS while staging rejects it', () => {
  const selfHosted = {
    ...valid,
    VITE_SUPABASE_URL: 'https://api.trajectory-life.ru',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_example',
  };
  assert.doesNotThrow(() => assertClientBuildEnvironment(selfHosted, releaseTargets.main));
  assert.throws(() => assertClientBuildEnvironment(selfHosted, releaseTargets.develop));
  assert.doesNotThrow(() =>
    assertClientBuildEnvironment(
      {
        ...valid,
        VITE_SUPABASE_URL: `https://${releaseTargets.main.projectRef}.supabase.co`,
        VITE_SUPABASE_ANON_KEY: publicKey({ role: 'anon', ref: releaseTargets.main.projectRef }),
      },
      releaseTargets.main,
    ),
  );
});

test('VPS releases reject URL drift, privileged keys and legacy hosted JWTs', () => {
  const selfHosted = {
    ...valid,
    VITE_SUPABASE_URL: 'https://api.trajectory-life.ru',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_example',
  };
  for (const patch of [
    { VITE_SUPABASE_URL: 'http://api.trajectory-life.ru' },
    { VITE_SUPABASE_URL: 'https://api.trajectory-life.ru/' },
    { VITE_SUPABASE_URL: 'https://api.trajectory-life.ru:8443' },
    { VITE_SUPABASE_URL: 'https://api.trajectory-life.ru.attacker.example' },
    { VITE_SUPABASE_ANON_KEY: 'sb_secret_example' },
    { VITE_SUPABASE_ANON_KEY: publicKey({ role: 'service_role', ref: releaseTargets.main.projectRef }) },
    { VITE_SUPABASE_ANON_KEY: publicKey({ role: 'anon', ref: releaseTargets.main.projectRef }) },
    { VITE_REQUIRE_AUTH: 'false' },
  ]) {
    assert.throws(() => assertClientBuildEnvironment({ ...selfHosted, ...patch }, releaseTargets.main));
  }
});
