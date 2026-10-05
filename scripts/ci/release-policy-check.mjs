import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { requireStaging, STAGING_ORIGIN } from '../staging/session.mjs';
import { assertReleaseRun, candidateDeploymentArgs, deploymentUrl, promoteVerified, releaseTargets } from './release-policy.mjs';

const sha = 'a'.repeat(40);
const repository = 'owner/project';
const run = {
  event: 'push',
  path: '.github/workflows/ci.yml',
  head_repository: { full_name: repository },
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
  head_branch: 'main',
};

test('only successful CI for the current release-branch source authorizes a release', () => {
  assert.doesNotThrow(() => assertReleaseRun(run, repository, sha, 'main', sha));
  for (const patch of [
    { event: 'pull_request' },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { head_repository: { full_name: 'fork/project' } },
    { head_sha: 'b'.repeat(40) },
  ]) {
    assert.throws(() => assertReleaseRun({ ...run, ...patch }, repository, sha, 'main', sha));
  }
  assert.throws(() => assertReleaseRun(run, repository, sha, 'main', 'b'.repeat(40)));
  assert.throws(() => assertReleaseRun(run, repository, sha, 'other', sha));
});

test('deployment URLs cannot redirect checks to arbitrary servers or paths', () => {
  assert.equal(deploymentUrl('candidate.vercel.app'), 'https://candidate.vercel.app');
  for (const value of [
    'https://example.com',
    'https://vercel.app.attacker.test',
    'https://user:pass@candidate.vercel.app',
    'https://candidate.vercel.app/path',
    'https://candidate.vercel.app?token=x',
    'http://candidate.vercel.app',
  ]) {
    assert.throws(() => deploymentUrl(value));
  }
});

function fixture(failure) {
  const previous = { id: 'old', url: 'previous.vercel.app', projectId: 'project', readyState: 'READY' };
  const candidate = { id: 'new', url: 'candidate.vercel.app', projectId: 'project', readyState: 'READY', meta: { sourceSha: sha } };
  let alias = previous;
  const events = [];
  const actions = {
    inspectAlias: async () => alias,
    smoke: async () => {
      events.push('smoke');
      if (failure === 'smoke') {
        throw new Error('smoke failed');
      }
      if (failure === 'external-during-smoke') {
        alias = { ...previous, id: 'third-party' };
      }
    },
    assertCurrent: async () => {
      events.push('current');
      if (failure === 'stale') {
        throw new Error('new commit');
      }
    },
    promote: async (deployment) => {
      events.push(`promote:${deployment.id}`);
      alias = deployment;
      if (failure === 'ambiguous-promotion' && deployment.id === 'new') {
        throw new Error('response lost');
      }
    },
    verifyAlias: async (deployment) => {
      events.push(`verify:${deployment.id}`);
      if (failure === 'verify' && deployment.id === 'new') {
        throw new Error('verification failed');
      }
      if (failure === 'external-promotion' && deployment.id === 'new') {
        alias = { ...previous, id: 'third-party' };
        throw new Error('another operator promoted');
      }
    },
  };
  return { input: { candidate, previous, sha, projectId: 'project' }, actions, events, alias: () => alias };
}

test('candidate smoke and current-commit check happen before promotion', async () => {
  const state = fixture();
  await promoteVerified(state.input, state.actions);
  assert.deepEqual(state.events, ['smoke', 'current', 'promote:new', 'verify:new']);
});

for (const failure of ['smoke', 'stale']) {
  test(`${failure} keeps the previous deployment active`, async () => {
    const state = fixture(failure);
    await assert.rejects(promoteVerified(state.input, state.actions));
    assert.equal(state.alias().id, 'old');
    assert.equal(
      state.events.some((event) => event.startsWith('promote:')),
      false,
    );
  });
}

for (const failure of ['verify', 'ambiguous-promotion']) {
  test(`${failure} restores and verifies the previous deployment`, async () => {
    const state = fixture(failure);
    await assert.rejects(promoteVerified(state.input, state.actions));
    assert.equal(state.alias().id, 'old');
    assert.deepEqual(state.events.slice(-2), ['promote:old', 'verify:old']);
  });
}

test('rollback cannot overwrite another operator or newer deployment', async () => {
  const state = fixture('external-promotion');
  await assert.rejects(promoteVerified(state.input, state.actions));
  assert.equal(state.alias().id, 'third-party');
  assert.equal(state.events.includes('promote:old'), false);
});

test('a deployment changed during smoke is never overwritten', async () => {
  const state = fixture('external-during-smoke');
  await assert.rejects(promoteVerified(state.input, state.actions));
  assert.equal(state.alias().id, 'third-party');
  assert.equal(
    state.events.some((event) => event.startsWith('promote:')),
    false,
  );
});

test('wrong project or source never reaches smoke or promotion', async () => {
  for (const patch of [{ projectId: 'other' }, { meta: { sourceSha: 'other' } }, { readyState: 'ERROR' }]) {
    const state = fixture();
    Object.assign(state.input.candidate, patch);
    await assert.rejects(promoteVerified(state.input, state.actions));
    assert.deepEqual(state.events, []);
  }
});

// Vercel CLI supports --skip-domain only for production. Preview branch domains
// are automatic, so the verified staging alias must be separate from that domain.
test('preview keeps branch-scoped settings without production-only CLI flags', () => {
  const args = candidateDeploymentArgs('develop', sha, 123);
  assert.ok(args.includes('--target=preview'));
  assert.equal(args.includes('--skip-domain'), false);
  assert.equal(args.includes('--prod'), false);
  assert.ok(args.includes('githubDeployment=1'));
  assert.ok(args.includes('githubCommitRef=develop'));
  assert.ok(args.includes(`githubCommitSha=${sha}`));
  assert.ok(args.includes(`sourceSha=${sha}`));
  assert.ok(args.includes('ciRun=123'));
  assert.equal(releaseTargets.develop.alias, 'trajectory-life-staging-trajectory3.vercel.app');
  assert.equal(releaseTargets.develop.alias.includes('-git-develop-'), false);
});

test('production is staged without automatic domain promotion', () => {
  const args = candidateDeploymentArgs('main', sha, 123);
  assert.ok(args.includes('--prod'));
  assert.ok(args.includes('--skip-domain'));
  assert.equal(args.includes('--target=preview'), false);
  assert.ok(args.includes('githubCommitRef=main'));
});

test('deployment arguments reject unsupported sources', () => {
  assert.throws(() => candidateDeploymentArgs('feature/example', sha, 123));
  assert.throws(() => candidateDeploymentArgs('constructor', sha, 123));
  assert.throws(() => candidateDeploymentArgs('develop', 'bad-sha', 123));
  assert.throws(() => candidateDeploymentArgs('develop', sha, 'bad-run'));
});

test('staging verification and Auth redirects follow the verified alias', () => {
  assert.equal(STAGING_ORIGIN, `https://${releaseTargets.develop.alias}`);
  assert.equal(requireStaging(STAGING_ORIGIN, true), STAGING_ORIGIN);
  assert.throws(() => requireStaging(STAGING_ORIGIN, false));
  assert.throws(() => requireStaging(`https://${releaseTargets.main.alias}`, true));
  assert.throws(() => requireStaging('https://trajectory-app-git-develop-trajectory3.vercel.app', true));
  const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  assert.ok(config.includes(`site_url = "${STAGING_ORIGIN}"`));
  assert.ok(config.includes(`"${STAGING_ORIGIN}/access"`));
  assert.ok(config.includes(`"${STAGING_ORIGIN}/password-reset"`));
  assert.ok(config.includes('"https://trajectory-app-git-develop-trajectory3.vercel.app/password-reset"'));
});
