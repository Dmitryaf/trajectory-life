// @vitest-environment happy-dom

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: vi.fn(() => ({ auth })),
  };
});

describe('startup cloud session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  it('uses the cached session when remote verification fails temporarily', async () => {
    const session = { user: { id: 'user-1' } };
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession()).resolves.toBe(session);
  });

  it('rejects a cached session when the server reports an auth error', async () => {
    const session = { user: { id: 'user-1' } };
    const error = new AuthApiError('Invalid token', 401, 'bad_jwt');
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error });
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession()).rejects.toBe(error);
  });
});
