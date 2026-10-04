// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudOperationCancelledError } from '../cloudOperation';

const client = vi.hoisted(() => ({ auth: { getSession: vi.fn(), getUser: vi.fn() }, from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'synthetic-public-key');
});
afterEach(() => vi.unstubAllEnvs());

it.each(['load', 'save'] as const)('does not %s a snapshot with a session belonging to another owner', async (operation) => {
  client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-B' } } }, error: null });
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-B' } }, error: null });
  const service = await import('../cloudSync');
  const scope = { userId: 'owner-A', assertCurrent: () => {} };
  const request = operation === 'load' ? service.loadCloudSnapshot(scope) : service.saveCloudSnapshot({ private: 'A' }, 1, scope);
  await expect(request).rejects.toThrow('Аккаунт изменился');
  expect(client.from).not.toHaveBeenCalled();
});

it('checks cancellation again after session verification, before issuing a write', async () => {
  client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-A' } } }, error: null });
  let active = true;
  client.auth.getUser.mockImplementation(async () => {
    active = false;
    return { error: null };
  });
  const service = await import('../cloudSync');
  const scope = {
    userId: 'owner-A',
    assertCurrent: () => {
      if (!active) {
        throw new CloudOperationCancelledError();
      }
    },
  };
  await expect(service.saveCloudSnapshot({ private: 'A' }, 1, scope)).rejects.toThrow('Аккаунт изменился');
  expect(client.from).not.toHaveBeenCalled();
});
