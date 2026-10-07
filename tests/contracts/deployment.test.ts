import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelConfig {
  git: { deploymentEnabled: Record<string, boolean> };
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: VercelHeader[] }>;
}

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as VercelConfig;

const spaFallbackSource = '/((?!api(?:/|$)|assets(?:/|$)).*)';
const snapshotRevisionMigration = readFileSync(
  new URL('../../supabase/migrations/20260820000000_add_snapshot_revision.sql', import.meta.url),
  'utf8',
);
const deleteAccountFunction = readFileSync(new URL('../../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8');
const deleteAccountHandler = readFileSync(new URL('../../supabase/functions/delete-account/handler.ts', import.meta.url), 'utf8');
const feedbackFunction = readFileSync(new URL('../../api/feedback.ts', import.meta.url), 'utf8');
const clientErrorFunction = readFileSync(new URL('../../api/client-error.ts', import.meta.url), 'utf8');
const cloudSyncService = readFileSync(new URL('../../src/services/cloudSync.ts', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const styleTokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const deployWorkflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8');
const packageConfig = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

function headerFor(source: string, key: string): string | undefined {
  return config.headers.find((rule) => rule.source === source)?.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())
    ?.value;
}

function cacheControlFor(source: string): string | undefined {
  return headerFor(source, 'Cache-Control');
}

function colorToken(name: string): string {
  const value = styleTokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  if (!value) {
    throw new Error(`Missing color token --${name}`);
  }
  return value;
}

describe('deployment configuration', () => {
  it('retains strict flaky failure and diagnostics across browser shards', () => {
    expect(ciWorkflow).toContain('run: npm run test:e2e:ci');
    expect(ciWorkflow).toContain('blob-report/');
    expect(ciWorkflow).toContain('qa/ci/browser-*.json');
    expect(packageConfig.scripts['test:e2e:ci']).toContain('--fail-on-flaky-tests');
    expect(playwrightConfig).toContain('retries: isCI ? 1 : 0');
    expect(playwrightConfig).toContain("trace: isCI ? 'retain-on-failure' : 'off'");
  });

  it('keeps the aggregate mandatory even when a prerequisite fails or is skipped', () => {
    expect(ciWorkflow).toMatch(/test-and-build:\s+if: always\(\)\s+needs: \[prepare, quality, browsers\]/);
    expect(ciWorkflow).toContain('node scripts/ci/gate.mjs');
    expect(ciWorkflow).not.toContain('continue-on-error: true');
  });

  it('reserves permanent deployment for successful push CI of this repository', () => {
    expect(config.git.deploymentEnabled).toEqual({ develop: false, main: false });
    expect(deployWorkflow).toContain('workflow_run:');
    expect(deployWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(deployWorkflow).toContain("github.event.workflow_run.event == 'push'");
    expect(deployWorkflow).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    expect(deployWorkflow).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
  });

  it('rewrites user routes to the SPA entry point', () => {
    expect(config.rewrites).toEqual([{ source: spaFallbackSource, destination: '/index.html' }]);
  });

  it('excludes API and asset paths from the SPA fallback', () => {
    const sourcePattern = new RegExp(`^${spaFallbackSource}$`);

    expect(sourcePattern.test('/week')).toBe(true);
    expect(sourcePattern.test('/unknown-page')).toBe(true);
    expect(sourcePattern.test('/api')).toBe(false);
    expect(sourcePattern.test('/api/feedback')).toBe(false);
    expect(sourcePattern.test('/assets')).toBe(false);
    expect(sourcePattern.test('/assets/missing.js')).toBe(false);
    expect(viteConfig).toContain('navigateFallbackDenylist: [/^\\/api(?:\\/|$)/, /^\\/assets(?:\\/|$)/]');
  });

  it('keeps hashed assets immutable', () => {
    expect(cacheControlFor('/assets/(.*)')).toBe('public, max-age=31536000, immutable');
  });

  it.each(['/sw.js', '/manifest.webmanifest'])('revalidates %s on every request', (source) => {
    expect(cacheControlFor(source)).toBe('public, max-age=0, must-revalidate');
  });

  it('allows only the app, Hosted Supabase and the pinned VPS while CSP remains report-only', () => {
    const policy = headerFor('/(.*)', 'Content-Security-Policy-Report-Only');

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    const connectSources = policy
      ?.split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .find(([name]) => name === 'connect-src');
    expect(connectSources?.slice(1).sort()).toEqual(
      ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://api.trajectory-life.ru', 'wss://api.trajectory-life.ru'].sort(),
    );
    expect(policy).not.toMatch(/report-(?:uri|to)/);
    expect(headerFor('/(.*)', 'X-Content-Type-Options')).toBe('nosniff');
    expect(headerFor('/(.*)', 'X-Frame-Options')).toBe('DENY');
    expect(headerFor('/(.*)', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerFor('/(.*)', 'Permissions-Policy')).toBe('camera=(), geolocation=(), microphone=()');
  });

  it('keeps installed PWA shell colors aligned with the current interface', () => {
    const themeColor = colorToken('navy');
    const backgroundColor = colorToken('page');

    expect(indexHtml).toContain(`<meta name="theme-color" content="${themeColor}" />`);
    expect(viteConfig).toContain(`theme_color: '${themeColor}'`);
    expect(viteConfig).toContain(`background_color: '${backgroundColor}'`);
  });

  it('supports fail-closed preview deployments without backend credentials', () => {
    expect(envExample).toContain('VITE_REQUIRE_AUTH=false');
    expect(envExample).toContain('VITE_FEEDBACK_ENABLED=false');
    expect(envExample).toContain('VITE_ERROR_MONITORING_ENABLED=false');
    expect(cloudSyncService).toContain("import.meta.env.VITE_REQUIRE_AUTH === 'true'");
  });

  it('installs the revision and realtime contract required for automatic multi-device sync', () => {
    expect(snapshotRevisionMigration).toContain('add column if not exists revision bigint');
    expect(snapshotRevisionMigration).toContain('trajectory_snapshots_revision_check');
    expect(snapshotRevisionMigration).toContain('alter publication supabase_realtime add table public.trajectory_snapshots');
    expect(cloudSyncService).toContain(".eq('revision', expectedRevision)");
    expect(cloudSyncService).toContain("'postgres_changes'");
  });

  it('keeps feedback delivery credentials and recipient on the server', () => {
    expect(feedbackFunction).toContain('process.env.FEEDBACK_TO_EMAIL');
    expect(feedbackFunction).toContain('process.env.RESEND_API_KEY');
    expect(feedbackFunction).toContain('/auth/v1/user');
    expect(feedbackFunction).not.toContain('import.meta.env');
  });

  it('keeps client error reports structured and delivery credentials on the server', () => {
    expect(clientErrorFunction).toContain('process.env.ERROR_TO_EMAIL');
    expect(clientErrorFunction).toContain('/auth/v1/user');
    expect(clientErrorFunction).toContain('Object.keys(record).length === 2');
    expect(clientErrorFunction).not.toContain('import.meta.env');
    expect(clientErrorFunction).not.toContain('body.message');
  });

  it('deletes only the authenticated caller through a server-side function', () => {
    expect(deleteAccountFunction).toContain('createDeleteAccountHandler');
    expect(deleteAccountFunction).toContain('auth.getUser(accessToken)');
    expect(deleteAccountFunction).toContain('auth.admin.deleteUser(userId)');
    expect(deleteAccountFunction).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(deleteAccountHandler).toContain("body.confirmation !== 'DELETE_MY_ACCOUNT'");
    expect(deleteAccountHandler).toContain('dependencies.deleteUser(userResult.user.id');
    expect(cloudSyncService).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
