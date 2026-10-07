import assert from 'node:assert/strict';

export function assertClientBuildEnvironment(environment, target) {
  for (const [name, value] of Object.entries(environment)) {
    if (name.startsWith('VITE_')) {
      assert.equal(typeof value, 'string', `Client configuration ${name} is missing`);
      assert.ok(!value.includes('[SENSITIVE]'), `Client configuration ${name} is not readable at build time`);
    }
  }
  const backendUrl = environment.VITE_SUPABASE_URL?.trim();
  const hostedUrl = `https://${target.projectRef}.supabase.co`;
  const selfHosted = Boolean(target.selfHostedUrl && backendUrl === target.selfHostedUrl);
  assert.ok(backendUrl === hostedUrl || selfHosted, 'Client backend must match the release environment');
  assert.equal(environment.VITE_REQUIRE_AUTH, 'true', 'Release must require authentication');
  const key = environment.VITE_SUPABASE_ANON_KEY?.trim();
  assert.ok(key, 'Public Supabase client key is required');
  if (key.startsWith('sb_publishable_')) {
    return;
  }
  assert.ok(!selfHosted, 'Self-hosted releases require a public publishable key');
  const parts = key.split('.');
  assert.equal(parts.length, 3, 'Expected a public Supabase client key');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Public Supabase client key has invalid claims');
  }
  assert.equal(claims.role, 'anon', 'Privileged keys must never enter a client build');
  assert.equal(claims.ref, target.projectRef, 'Public key must match the release backend');
}
