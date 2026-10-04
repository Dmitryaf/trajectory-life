import { describe, expect, it, vi } from 'vitest';
import { createTelemetryHandler } from '../../supabase/functions/product-events/handler';
import { randomUUID } from 'node:crypto';

const origin = 'https://staging.example.test';
const now = Date.now();
function event() {
  return {
    event_id: randomUUID(),
    event_name: 'daily_entry_saved',
    schema_version: 1,
    occurred_at: new Date(now).toISOString(),
    app_version: '0.1.0',
    platform: 'web',
    props: { save_kind: 'created', recorded_field_count: 2, entry_count_bucket: '1' },
  };
}
function setup(enabled = true) {
  const getUser = vi.fn(async () => ({ id: 'verified-owner' }));
  const process = vi.fn(async () => ({ accepted: [] }));
  return { getUser, process, handler: createTelemetryHandler({ enabled, allowedOrigins: [origin], getUser, process, now: () => now }) };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://backend.example.test/functions/v1/product-events', {
    method: 'POST',
    headers: { origin, authorization: 'Bearer token-a', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
describe('first-party ingestion boundary', () => {
  it('validates preference operations without coercing arbitrary objects and honors the kill switch', async () => {
    const { handler, process } = setup();
    for (const operation of ['offer', 'reminder']) {
      const body = { operation, revision: randomUUID() };
      expect((await handler(request(body))).status).toBe(200);
      expect(process).toHaveBeenLastCalledWith('verified-owner', body);
      expect((await handler(request({ operation }))).status).toBe(400);
      expect((await handler(request({ ...body, note: 'private' }))).status).toBe(400);
    }
    expect((await handler(request({ operation: { toString: null } }))).status).toBe(400);
    const killed = setup(false).handler;
    expect((await killed(request({ operation: 'offer', revision: randomUUID() }))).status).toBe(503);
    expect((await killed(request({ operation: 'reminder', revision: randomUUID() }))).status).toBe(503);
    expect((await killed(request({ operation: 'snooze' }))).status).toBe(200);
  });
  it('derives identity exclusively from verified auth and denies missing/deleted users', async () => {
    const { handler, process, getUser } = setup();
    const body = { operation: 'ingest', revision: randomUUID(), events: [event()] };
    expect((await handler(request(body))).status).toBe(200);
    expect(process).toHaveBeenCalledWith('verified-owner', body);
    expect((await handler(request({ ...body, user_id: 'other' }))).status).toBe(400);
    expect((await handler(request(body, { authorization: '' }))).status).toBe(401);
    getUser.mockResolvedValueOnce(null as unknown as { id: string });
    expect((await handler(request(body))).status).toBe(401);
  });
  it('rejects contents, arbitrary keys, wrong types, timestamps, schemas and names', async () => {
    const { handler, process } = setup();
    const base = event();
    const bad = [
      { ...base, email: 'private@example.test' },
      { ...base, props: { ...base.props, sleepMinutes: 480 } },
      { ...base, props: { ...base.props, recorded_field_count: '2' } },
      { ...base, props: { ...base.props, save_kind: ['created'] } },
      { ...base, props: { ...base.props, entry_count_bucket: ['1'] } },
      { ...base, props: { ...base.props, note: 'secret' } },
      { ...base, props: { ...base.props, contextFactors: ['private'] } },
      { ...base, event_name: 'account_created' },
      { ...base, schema_version: 2 },
      { ...base, occurred_at: new Date(now - 8 * 86_400_000).toISOString() },
      { ...base, platform: 'full user agent' },
      { ...base, app_version: 'https://app/?token=private' },
    ];
    for (const e of bad) {
      expect((await handler(request({ operation: 'ingest', revision: randomUUID(), events: [e] }))).status).toBe(400);
    }
    expect(process).not.toHaveBeenCalled();
  });
  it('enforces origin, bytes without content-length, and batch bounds before auth', async () => {
    const { handler, getUser } = setup();
    const body = { operation: 'ingest', revision: randomUUID(), events: Array.from({ length: 21 }, event) };
    expect((await handler(request(body))).status).toBe(400);
    expect((await handler(request({ operation: 'status', padding: 'x'.repeat(17_000) }))).status).toBe(400);
    expect((await handler(request({ operation: 'status' }, { origin: 'https://other.example.test' }))).status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
  });
  it('keeps withdrawal available when collection is killed, and sanitizes failures', async () => {
    const { handler, process } = setup(false);
    expect((await handler(request({ operation: 'grant', revision: randomUUID() }))).status).toBe(503);
    expect((await handler(request({ operation: 'withdraw' }))).status).toBe(200);
    process.mockRejectedValueOnce(new Error('private database secret'));
    const response = await handler(request({ operation: 'status' }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
});
