import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { requireDistinctClients, requireRequestPath, requireStaging, STAGING_ORIGIN } from '../../scripts/staging/session.mjs';
import { reportExitCode, runSuites } from '../../scripts/staging/runner.mjs';
import { telemetryConsent, telemetryPermissions } from '../../scripts/staging/telemetry.mjs';
import { createTelemetryHandler } from '../../supabase/functions/product-events/handler';

const clients = () =>
  ['A', 'B'].map((label) => ({ label, userId: randomUUID(), backend: 'https://test.supabase.co', origin: STAGING_ORIGIN }));

describe('staging verification boundaries', () => {
  it('requires the exact staging origin and explicit test-account confirmation', () => {
    expect(requireStaging(STAGING_ORIGIN, true)).toBe(STAGING_ORIGIN);
    for (const origin of ['https://trajectory-app.vercel.app', STAGING_ORIGIN + '.evil.invalid', STAGING_ORIGIN + '/']) {
      expect(() => requireStaging(origin, true)).toThrow();
    }
    for (const confirmation of [undefined, false, 'true']) {
      expect(() => requireStaging(STAGING_ORIGIN, confirmation)).toThrow();
    }
  });

  it('denies external URLs, admin endpoints, and global purge RPCs', () => {
    expect(requireRequestPath('/rest/v1/trajectory_snapshots?user_id=eq.test')).toBe('/rest/v1/trajectory_snapshots?user_id=eq.test');
    for (const path of [
      'https://evil.invalid/rest/v1/trajectory_snapshots',
      'https://guard.invalid/rest/v1/trajectory_snapshots',
      '//evil.invalid/rest/v1/trajectory_snapshots',
      '/auth/v1/admin/users',
      '/rest/v1/rpc/purge_product_events',
      '/functions/v1/delete-account',
    ]) {
      expect(() => requireRequestPath(path)).toThrow();
    }
  });

  it('requires distinct users on the same backend', () => {
    const pair = clients();
    expect(() => requireDistinctClients(pair)).not.toThrow();
    expect(() => requireDistinctClients([pair[0], pair[0]])).toThrow();
    expect(() => requireDistinctClients([pair[0]])).toThrow();
    expect(() => requireDistinctClients([pair[0], { ...pair[1], backend: 'https://other.supabase.co' }])).toThrow();
  });

  it('does not run scenarios without explicit confirmation', async () => {
    const run = vi.fn();
    await expect(runSuites(clients(), [{ name: 'no-write', run }])).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it('reports incomplete live coverage separately and continues independent checks', async () => {
    const report = await runSuites(
      clients(),
      [
        { name: 'blocked', run: async () => ({ available: false }) },
        { name: 'passed', run: async () => ({ checked: true }) },
        { name: 'partial', run: async () => ({ unverified: ['database deletion'] }) },
      ],
      { confirmed: true },
    );
    expect(report.suites.map((suite) => suite.status)).toEqual(['blocked', 'passed', 'blocked']);
    expect(report.exitCode).toBe(2);
    expect(reportExitCode({ suites: [{ status: 'passed' }] })).toBe(0);
  });

  it('stops after a security failure and suppresses raw error contents', async () => {
    const later = vi.fn();
    const report = await runSuites(
      clients(),
      [
        {
          name: 'isolation',
          critical: true,
          run: async () => {
            throw new Error('Bearer test-secret and private journal text');
          },
        },
        { name: 'later-write', run: later },
      ],
      { confirmed: true },
    );
    expect(report.exitCode).toBe(1);
    expect(later).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain('test-secret');
    expect(JSON.stringify(report)).not.toContain('private journal');
  });
});

describe('telemetry staging scenarios', () => {
  it('uses scoped negative checks and never invokes global retention', async () => {
    const pair = clients();
    for (const client of pair) {
      client.request = vi.fn(async () => ({ status: 403, body: { code: '42501' } }));
    }
    expect(await telemetryPermissions(pair)).toHaveLength(30);
    for (const client of pair) {
      for (const [method, path, data] of client.request.mock.calls) {
        expect(path).not.toContain('purge');
        if (path.includes('/rpc/')) {
          expect(data).toMatchObject({ p_operation: 'status' });
        } else if (method === 'POST') {
          expect(pair.some((user) => user.userId === data.user_id)).toBe(true);
        } else {
          expect(path).toContain('?user_id=eq.');
        }
      }
    }
  });

  it('does not mistake an empty result or missing table for permission denial', async () => {
    for (const response of [
      { status: 200, body: [] },
      { status: 404, body: { code: '42P01' } },
    ]) {
      const pair = clients().map((client) => ({ ...client, request: async () => response }));
      await expect(telemetryPermissions(pair)).rejects.toThrow();
    }
  });

  it('leaves consent untouched when the live Origin is rejected', async () => {
    const pair = clients().map((client) => ({
      ...client,
      request: vi.fn(async () => ({ status: 403, body: { error: 'origin_denied' } })),
    }));
    expect(await telemetryConsent(pair)).toMatchObject({ available: false, status: { status: 403, error: 'origin_denied' } });
    expect(pair[0].request).toHaveBeenCalledTimes(1);
    expect(pair[1].request).not.toHaveBeenCalled();
  });

  for (const enabled of [false, true]) {
    it(`sends valid wire requests through the real handler with collection enabled=${enabled}`, async () => {
      const pair = clients();
      const state = new Map(pair.map((client) => [client.userId, { enabled: false, revision: randomUUID(), decision: 'declined' }]));
      const calls = [];
      const handler = createTelemetryHandler({
        enabled,
        allowedOrigins: [STAGING_ORIGIN],
        getUser: async (token) => (pair.some((client) => client.userId === token) ? { id: token } : null),
        process: async (id, body) => {
          calls.push(body);
          const current = state.get(id);
          if (body.operation === 'withdraw') {
            Object.assign(current, { enabled: false, revision: randomUUID(), decision: 'declined' });
          } else if (body.operation !== 'status' && body.revision !== current.revision) {
            return { error: 'stale_revision', status: 409 };
          } else if (body.operation === 'grant') {
            Object.assign(current, { enabled: true, revision: randomUUID(), decision: 'allowed' });
          } else if (body.operation === 'ingest') {
            return { accepted: body.events.map((event) => event.event_id) };
          }
          return { ...current };
        },
      });
      for (const client of pair) {
        client.request = async (method, path, body, options = {}) => {
          const response = await handler(
            new Request(client.backend + path, {
              method,
              body: JSON.stringify(body),
              headers: {
                Origin: options.requestOrigin ?? STAGING_ORIGIN,
                'Content-Type': 'application/json',
                ...(options.anonymous ? {} : { Authorization: `Bearer ${client.userId}` }),
              },
            }),
          );
          return { status: response.status, body: await response.json() };
        };
      }
      const result = await telemetryConsent(pair);
      expect(result).toMatchObject({ available: true, collectionEnabled: enabled });
      expect(state.get(pair[0].userId).enabled).toBe(false);
      expect(calls.filter((call) => call.operation === 'ingest')).toHaveLength(enabled ? 3 : 0);
    });
  }
});
