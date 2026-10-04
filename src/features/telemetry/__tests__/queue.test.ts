import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TELEMETRY_STORAGE_KEY, TelemetryQueue, type TelemetryState } from '../queue';
import { hasTelemetryState } from '../storage';

function setup(collectionEnabled = true) {
  let now = Date.now();
  const values = new Map<string, string>();
  const revision = randomUUID();
  const state: TelemetryState = { available: false, enabled: false, busy: false, pendingWithdrawal: false, message: '' };
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const request = vi.fn(
    async (
      _token: string,
      body: Record<string, unknown>,
      _signal: AbortSignal,
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
      expect(_signal).toBeInstanceOf(AbortSignal);
      if (body.operation === 'ingest') {
        return { status: 200, body: { accepted: (body.events as { event_id: string }[]).map((event) => event.event_id) } };
      }
      return {
        status: 200,
        body: { enabled: body.operation !== 'withdraw', revision, policy_version: 1, server_time: new Date(now).toISOString() },
      };
    },
  );
  const deps = {
    state,
    storage,
    request,
    now: () => now,
    uuid: randomUUID,
    appVersion: '0.1.0',
    platform: 'web' as const,
    collectionEnabled,
  };
  const queue = new TelemetryQueue(deps);
  async function connect(owner = 'a') {
    queue.setSession(owner, `token-${owner}`);
    await vi.waitFor(() => expect(state.busy).toBe(false));
  }
  const queued = () =>
    JSON.parse(values.get(TELEMETRY_STORAGE_KEY) ?? '{"events":[]}').events as { event_id: string; event_name: string }[];
  return {
    queue,
    state,
    values,
    storage,
    request,
    connect,
    queued,
    deps,
    revision,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('consent-aware owner-bound telemetry queue', () => {
  it('retries a marker-only snooze with collection disabled after the old queue was removed', async () => {
    const s = setup(false);
    s.values.set('trajectory:telemetry-withdrawal:a', 'snooze');
    vi.stubGlobal('localStorage', s.storage);
    try {
      expect(hasTelemetryState('a')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    s.request.mockResolvedValue({
      status: 200,
      body: { enabled: false, revision: s.revision, policy_version: 1, server_time: new Date().toISOString(), decision: 'snoozed' },
    });
    await s.connect();
    expect(s.request.mock.calls[0][1]).toEqual({ operation: 'snooze' });
    expect(s.state.pendingWithdrawal).toBe(false);
    expect(s.state.enabled).toBe(false);
  });
  it.each(['withdraw', 'snooze'] as const)(
    'persists %s across a new queue instance offline, retries before enabling, and never backfills',
    async (operation) => {
      const s = setup();
      await s.connect();
      const before = s.queue.capture('daily_entry_saved', { save_kind: 'created', recorded_field_count: 1, entry_count_bucket: '1' });
      s.request.mockRejectedValue(new Error('offline'));
      await s.queue.withdraw(operation);
      before();
      expect(s.queued()).toHaveLength(0);
      s.queue.stop();
      const restarted = new TelemetryQueue(s.deps);
      restarted.setSession('a', 'token-a');
      await vi.waitFor(() => expect(s.state.busy).toBe(false));
      expect(s.state.pendingWithdrawal).toBe(true);
      await restarted.grant();
      expect(s.state.enabled).toBe(false);
      s.request.mockResolvedValue({
        status: 200,
        body: {
          enabled: false,
          revision: randomUUID(),
          policy_version: 1,
          server_time: new Date().toISOString(),
          decision: operation === 'snooze' ? 'snoozed' : 'declined',
        },
      });
      await restarted.refresh();
      expect(s.request.mock.calls.at(-1)?.[1]).toEqual({ operation });
      expect(s.state.pendingWithdrawal).toBe(false);
      expect(s.state.enabled).toBe(false);
      expect(s.queued()).toHaveLength(0);
    },
  );
  it('removes expired or foreign persisted events even when consent status cannot be fetched offline', async () => {
    const s = setup();
    await s.connect();
    s.queue.capture('app_opened', {})();
    s.queue.stop();
    s.advance(8 * 86_400_000);
    s.request.mockRejectedValue(new Error('offline'));
    await s.connect();
    expect(s.queued()).toHaveLength(0);
    s.queue.stop();
    s.values.set(
      TELEMETRY_STORAGE_KEY,
      JSON.stringify({ owner: 'another-account', revision: s.revision, events: [{ private: 'CANARY' }] }),
    );
    await s.connect('b');
    expect(s.values.has(TELEMETRY_STORAGE_KEY)).toBe(false);
  });
  it('cleans deleted-account state without deleting another account queue, and rejects an unknown consent version', async () => {
    const s = setup();
    await s.connect();
    s.queue.capture('app_opened', {})();
    s.queue.clearDeletedAccount('a');
    expect(s.values.has(TELEMETRY_STORAGE_KEY)).toBe(false);
    await s.connect('b');
    s.queue.capture('week_opened', {})();
    s.queue.clearDeletedAccount('a');
    expect(s.queued()).toHaveLength(1);
    s.state.message = 'Сбор разрешён.';
    s.request.mockResolvedValueOnce({
      status: 200,
      body: { enabled: true, revision: s.revision, policy_version: 2, server_time: new Date().toISOString() },
    });
    await s.queue.refresh();
    expect(s.state.enabled).toBe(false);
    expect(s.state.available).toBe(false);
    expect(s.state.message).toBe('');
    expect(s.queued()).toHaveLength(0);
  });
  it('collects nothing before consent and makes no requests in a fresh disabled build', async () => {
    const disabled = setup(false);
    disabled.queue.setSession('a', 'token-a');
    disabled.queue.capture('app_opened', {})();
    await disabled.queue.flush();
    expect(disabled.request).not.toHaveBeenCalled();
    const s = setup();
    s.request.mockResolvedValue({
      status: 200,
      body: { enabled: false, revision: s.revision, policy_version: 1, server_time: new Date().toISOString() },
    });
    await s.connect();
    s.queue.capture('app_opened', {})();
    expect(s.queued()).toHaveLength(0);
  });
  it('bounds the queue and batches, retains stable ids after an unknown delivery outcome, and expires old events', async () => {
    const s = setup();
    await s.connect();
    for (let i = 0; i < 120; i++) {
      s.queue.capture('week_opened', {})();
    }
    expect(s.queued()).toHaveLength(100);
    const ids = s
      .queued()
      .slice(0, 20)
      .map((event) => event.event_id);
    const original = s.request.getMockImplementation()!;
    let failed = false;
    s.request.mockImplementation(async (...args) => {
      if (args[1].operation === 'ingest' && !failed) {
        failed = true;
        throw new Error('connection lost after commit');
      }
      return original(...args);
    });
    await s.queue.flush();
    expect(s.queued()).toHaveLength(100);
    await s.queue.flush();
    const batches = s.request.mock.calls.filter((call) => call[1].operation === 'ingest');
    expect(batches).toHaveLength(2);
    expect(batches[0][1].events).toEqual(batches[1][1].events);
    expect((batches[0][1].events as { event_id: string }[]).map((event) => event.event_id)).toEqual(ids);
    expect(s.queued()).toHaveLength(80);
    s.advance(8 * 86_400_000);
    await s.queue.flush();
    expect(s.queued()).toHaveLength(0);
  });
  it('discards account A events and completions when B signs in, even if an old request ignores abort', async () => {
    const s = setup();
    await s.connect();
    const completeA = s.queue.capture('daily_entry_saved', { save_kind: 'created', recorded_field_count: 1, entry_count_bucket: '1' });
    s.queue.capture('app_opened', {})();
    let resolve!: (value: { status: number; body: Record<string, unknown> }) => void;
    s.request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const flushing = s.queue.flush();
    await s.connect('b');
    completeA();
    resolve({ status: 200, body: { enabled: true, revision: randomUUID(), policy_version: 1, server_time: new Date().toISOString() } });
    await flushing;
    expect(s.queued()).toHaveLength(0);
    s.queue.capture('month_opened', {})();
    await s.queue.flush();
    const batches = s.request.mock.calls.filter((call) => call[1].operation === 'ingest');
    expect(batches).toHaveLength(1);
    expect(batches[0][0]).toBe('token-b');
    expect(batches[0][1].events).toEqual([expect.objectContaining({ event_name: 'month_opened' })]);
    s.queue.setSession('', '');
    expect(s.values.has(TELEMETRY_STORAGE_KEY)).toBe(false);
  });
  it('stops immediately offline, persists only the owner-bound withdrawal intent across logout, and retries deletion', async () => {
    const s = setup();
    await s.connect();
    s.queue.capture('app_opened', {})();
    s.request.mockRejectedValueOnce(new Error('offline'));
    await s.queue.withdraw();
    s.queue.capture('week_opened', {})();
    expect(s.state).toMatchObject({ enabled: false, pendingWithdrawal: true });
    expect(s.queued()).toHaveLength(0);
    s.queue.setSession('', '');
    expect(s.values.get('trajectory:telemetry-withdrawal:a')).toBe('true');
    await s.connect('b');
    expect(s.request.mock.calls.filter((call) => call[0] === 'token-b' && call[1].operation === 'withdraw')).toHaveLength(0);
    await s.connect('a');
    expect(s.state.pendingWithdrawal).toBe(false);
    expect(s.values.has('trajectory:telemetry-withdrawal:a')).toBe(false);
  });
  it('handles remote revocation, rate limits, corrupted storage, and storage failure without failing saves', async () => {
    const s = setup();
    s.values.set(TELEMETRY_STORAGE_KEY, '{broken');
    await s.connect();
    s.queue.capture('app_opened', {})();
    s.request.mockResolvedValueOnce({ status: 429, body: { error: 'rate_limited' } });
    await s.queue.flush();
    const attempts = s.request.mock.calls.length;
    await s.queue.flush();
    expect(s.request).toHaveBeenCalledTimes(attempts);
    s.advance(60_001);
    s.request.mockResolvedValueOnce({
      status: 200,
      body: { enabled: false, revision: randomUUID(), policy_version: 1, server_time: new Date().toISOString() },
    });
    await s.queue.flush();
    expect(s.queued()).toHaveLength(0);
    expect(s.state.enabled).toBe(false);
    s.storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => s.queue.capture('week_opened', {})()).not.toThrow();
  });
  it('restores only validated same-owner events and does not upload legacy first-use history', async () => {
    const s = setup();
    await s.connect();
    s.queue.capture('app_opened', {})();
    s.values.set('trajectory:first-use-funnel:v1', JSON.stringify({ events: { first_use_recovery_started: '2026-01-01' } }));
    const saved = JSON.parse(s.values.get(TELEMETRY_STORAGE_KEY)!);
    saved.events.push({ ...saved.events[0], props: { note: 'PRIVATE CANARY' } });
    s.values.set(TELEMETRY_STORAGE_KEY, JSON.stringify(saved));
    s.queue.stop();
    const reloaded = new TelemetryQueue(s.deps);
    reloaded.setSession('a', 'token-a');
    await vi.waitFor(() => expect(s.state.busy).toBe(false));
    await reloaded.flush();
    const batch = s.request.mock.calls.find((call) => call[1].operation === 'ingest')!;
    expect(batch[1].events).toHaveLength(1);
    expect(JSON.stringify(batch)).not.toContain('PRIVATE CANARY');
    expect(JSON.stringify(batch)).not.toContain('first_use_recovery_started');
  });
});
