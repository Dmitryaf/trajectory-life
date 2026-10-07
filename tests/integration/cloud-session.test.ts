// @vitest-environment happy-dom

import { AuthApiError, AuthRetryableFetchError, createClient, type Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(() => ({ auth })) };
});

const storageKey = 'sb-project-auth-token';
const ownerKey = 'trajectory:local-owner-id';
const fetchMock = vi.fn<typeof fetch>();

function sessionFor(userId = 'user-1', token = 'cached-token'): Session {
  return {
    access_token: token,
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-07T00:00:00Z' },
  };
}

function cacheSession(session: Session, owner = session.user.id, key = storageKey) {
  window.localStorage.setItem(key, JSON.stringify(session));
  window.localStorage.setItem(ownerKey, owner);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function userResponse(id = 'user-1', status = 200) {
  return new Response(JSON.stringify(status === 200 ? { id } : { code: 'session_not_found' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function cloudFetch() {
  const { getSupabaseClient } = await import('@/services/cloudSync');
  getSupabaseClient();
  const configuredFetch = vi.mocked(createClient).mock.calls[0]?.[2]?.global?.fetch;
  expect(configuredFetch).toBeTypeOf('function');
  return configuredFetch!;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  auth.getSession.mockReset();
  auth.getUser.mockReset();
  fetchMock.mockReset();
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T14:00:00Z'));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe('offline startup identity', () => {
  beforeEach(() => {
    vi.mocked(navigator, true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  });

  it('opens the active session owned by local data without waiting for SDK or network', async () => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockReturnValue(new Promise(() => {}));
    const onSessionLoaded = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession({ onSessionLoaded })).resolves.toEqual(session);
    expect(onSessionLoaded).toHaveBeenCalledExactlyOnceWith(session);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'expired',
    'expires-now',
    'missing',
    'malformed',
    'missing-token',
    'missing-refresh',
    'invalid-expiry',
    'missing-user',
    'wrong-owner',
    'missing-owner',
  ])('keeps the auth gate for %s cache without deleting local identity or session', async (kind) => {
    const session = sessionFor();
    cacheSession(session);
    if (kind === 'expired') {
      session.expires_at = Math.floor(Date.now() / 1000) - 1;
    }
    if (kind === 'expires-now') {
      session.expires_at = Math.floor(Date.now() / 1000);
    }
    if (kind === 'missing-token') {
      session.access_token = '';
    }
    if (kind === 'missing-refresh') {
      session.refresh_token = '';
    }
    if (kind === 'invalid-expiry') {
      session.expires_at = Number.NaN;
    }
    if (kind === 'missing-user') {
      session.user.id = '';
    }
    window.localStorage.setItem(storageKey, JSON.stringify(session));
    if (kind === 'missing') {
      window.localStorage.removeItem(storageKey);
    }
    if (kind === 'malformed') {
      window.localStorage.setItem(storageKey, '{broken');
    }
    if (kind === 'wrong-owner') {
      window.localStorage.setItem(ownerKey, 'another-user');
    }
    if (kind === 'missing-owner') {
      window.localStorage.removeItem(ownerKey);
    }
    const before = { cache: window.localStorage.getItem(storageKey), owner: window.localStorage.getItem(ownerKey) };
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession()).resolves.toBeNull();
    expect(window.localStorage.getItem(storageKey)).toBe(before.cache);
    expect(window.localStorage.getItem(ownerKey)).toBe(before.owner);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads only the current backend SDK storage key after a backend change', async () => {
    cacheSession(sessionFor(), 'user-1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://api.trajectory-life.ru');
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    await expect(getStartupCloudSession()).resolves.toBeNull();

    const current = sessionFor('user-1', 'current-backend-token');
    cacheSession(current, 'user-1', 'sb-api-auth-token');
    await expect(getStartupCloudSession()).resolves.toEqual(current);
  });
});

describe('online startup verification', () => {
  it('verifies the captured JWT against the current backend without SDK auth side effects', async () => {
    const session = sessionFor();
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    fetchMock.mockResolvedValue(userResponse());
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession()).resolves.toBe(session);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/user',
      expect.objectContaining({
        headers: { apikey: 'anon-key', Authorization: 'Bearer cached-token' },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('does not restore stale cache when the SDK explicitly has no session', async () => {
    cacheSession(sessionFor());
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    await expect(getStartupCloudSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['network', 'server'] as const)('uses an owned active cache after a temporary %s verification failure', async (kind) => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    if (kind === 'network') {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    } else {
      fetchMock.mockResolvedValue(userResponse('user-1', 503));
    }
    const onAuthRejected = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession({ onAuthRejected })).resolves.toEqual(session);
    expect(onAuthRejected).not.toHaveBeenCalled();
  });

  it('does not accept another local owner on temporary verification failure', async () => {
    const session = sessionFor();
    cacheSession(session, 'another-user');
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    await expect(getStartupCloudSession()).rejects.toBeInstanceOf(AuthRetryableFetchError);
  });

  it.each(['rejected-token', 'different-user'] as const)('rejects %s even with a valid owned fallback', async (kind) => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    fetchMock.mockResolvedValue(kind === 'rejected-token' ? userResponse('user-1', 401) : userResponse('another-user'));
    const onAuthRejected = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');

    await expect(getStartupCloudSession({ onAuthRejected })).rejects.toMatchObject({ status: 401 });
    expect(onAuthRejected).toHaveBeenCalledExactlyOnceWith(expect.any(AuthApiError), session);
  });

  it('bounds a hanging SDK session read and re-reads cache at the deadline', async () => {
    cacheSession(sessionFor());
    auth.getSession.mockReturnValue(new Promise(() => {}));
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    const result = getStartupCloudSession();
    await vi.advanceTimersByTimeAsync(4999);
    const fresh = sessionFor('user-1', 'replacement-token');
    cacheSession(fresh);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual(fresh);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['removed', 'owner-changed', 'expired'] as const)(
    'rejects a hanging session read if cached identity becomes %s before the deadline',
    async (kind) => {
      const session = sessionFor();
      if (kind === 'expired') {
        session.expires_at = Math.floor(Date.now() / 1000) + 2;
      }
      cacheSession(session);
      auth.getSession.mockReturnValue(new Promise(() => {}));
      const { getStartupCloudSession } = await import('@/services/cloudSync');
      const result = expect(getStartupCloudSession()).rejects.toThrow('Не удалось проверить вход');
      if (kind === 'removed') {
        window.localStorage.removeItem(storageKey);
      }
      if (kind === 'owner-changed') {
        window.localStorage.setItem(ownerKey, 'another-user');
      }
      await vi.advanceTimersByTimeAsync(5000);
      await result;
    },
  );

  it('gives session read and remote verification one shared startup budget', async () => {
    const session = sessionFor();
    cacheSession(session);
    const sdk = deferred<{ data: { session: Session }; error: null }>();
    auth.getSession.mockReturnValue(sdk.promise);
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    const result = getStartupCloudSession();
    let completed = false;
    void result.then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(3000);
    sdk.resolve({ data: { session }, error: null });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual(session);
  });

  it('ignores a session arriving after the startup deadline instead of verifying an obsolete JWT', async () => {
    const session = sessionFor();
    cacheSession(session);
    const sdk = deferred<{ data: { session: Session }; error: null }>();
    auth.getSession.mockReturnValue(sdk.promise);
    const onSessionLoaded = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    const result = getStartupCloudSession({ onSessionLoaded });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual(session);
    const newer = sessionFor('user-2', 'newer-token');
    cacheSession(newer);
    sdk.resolve({ data: { session }, error: null });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSessionLoaded).toHaveBeenCalledExactlyOnceWith(session);
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(newer);
  });

  it('falls back if verification receives headers but its body never finishes', async () => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    fetchMock.mockImplementation(
      async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init!.signal!.addEventListener('abort', () => controller.error(init!.signal!.reason), { once: true });
            },
          }),
        ),
    );
    const onAuthRejected = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    const result = getStartupCloudSession({ onAuthRejected });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual(session);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(onAuthRejected).not.toHaveBeenCalled();
  });
  it('reports a late explicit rejection for the captured session after offline fallback', async () => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    const remote = deferred<Response>();
    fetchMock.mockReturnValue(remote.promise);
    const onAuthRejected = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    const result = getStartupCloudSession({ onAuthRejected });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual(session);
    const newer = sessionFor('user-2', 'newer-session-token');
    cacheSession(newer);
    remote.resolve(userResponse('user-1', 401));
    await vi.advanceTimersByTimeAsync(0);

    expect(onAuthRejected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }), session);
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(newer);
    expect(window.localStorage.getItem(ownerKey)).toBe('user-2');
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('does not invalidate identity for a late transient verification failure', async () => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    const remote = deferred<Response>();
    fetchMock.mockReturnValue(remote.promise);
    const onAuthRejected = vi.fn();
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    const result = getStartupCloudSession({ onAuthRejected });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual(session);
    remote.reject(new TypeError('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onAuthRejected).not.toHaveBeenCalled();
  });
});

describe('authoritative Auth rejection', () => {
  it.each(['empty', 'malformed', 'stalled'] as const)('rejects 401 without consuming a %s body', async (kind) => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    const response = new Response(kind === 'empty' ? '' : 'invalid-json', { status: 401 });
    const body = vi.spyOn(response, 'json');
    if (kind === 'stalled') {
      body.mockReturnValue(new Promise(() => {}));
    }
    fetchMock.mockResolvedValue(response);
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    await expect(getStartupCloudSession()).rejects.toMatchObject({ status: 401 });
    expect(body).not.toHaveBeenCalled();
  });
  it('rejects an empty 403 without accepting a cached session', async () => {
    const session = sessionFor();
    cacheSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    const { getStartupCloudSession } = await import('@/services/cloudSync');
    await expect(getStartupCloudSession()).rejects.toMatchObject({ status: 403 });
  });
  it('removes only the rejected current Auth cache and preserves local ownership', async () => {
    const session = sessionFor();
    cacheSession(session);
    const { invalidateCachedCloudSession, getStartupCloudSession } = await import('@/services/cloudSync');
    invalidateCachedCloudSession(session);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(window.localStorage.getItem(ownerKey)).toBe(session.user.id);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(getStartupCloudSession()).resolves.toBeNull();
  });
  it.each(['another-account', 'refreshed-token'] as const)('preserves the %s cache on rejection of an old token', async (kind) => {
    const rejected = sessionFor();
    const current = sessionFor(kind === 'another-account' ? 'user-2' : 'user-1', 'new-token');
    cacheSession(current);
    window.localStorage.setItem('sb-another-backend-auth-token', 'separate-backend-cache');
    const { invalidateCachedCloudSession } = await import('@/services/cloudSync');
    invalidateCachedCloudSession(rejected);
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(current);
    expect(window.localStorage.getItem(ownerKey)).toBe(current.user.id);
    expect(window.localStorage.getItem('sb-another-backend-auth-token')).toBe('separate-backend-cache');
  });
});

describe('cloud transport cancellation', () => {
  it('fails immediately offline without sending an HTTP request', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const request = await cloudFetch();
    await expect(request('https://project.supabase.co/rest/v1/snapshots')).rejects.toThrow('Network is offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['init', 'request'] as const)('honors a parent signal provided by %s', async (source) => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const request = await cloudFetch();
    const parent = new AbortController();
    const input =
      source === 'request'
        ? new Request('https://project.supabase.co/rest/v1/snapshots', { signal: parent.signal })
        : 'https://project.supabase.co/rest/v1/snapshots';
    const result = request(input, source === 'init' ? { signal: parent.signal } : undefined);
    const reason = new DOMException('Caller cancelled', 'AbortError');
    const rejected = expect(result).rejects.toBe(reason);
    parent.abort(reason);
    await rejected;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('does not send an already cancelled request', async () => {
    const request = await cloudFetch();
    const parent = new AbortController();
    parent.abort();
    await expect(request('https://project.supabase.co/auth/v1/user', { signal: parent.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts a stalled HTTP request after the transport deadline', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const request = await cloudFetch();
    const rejected = expect(request('https://project.supabase.co/rest/v1/snapshots')).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('keeps cancellation active while consuming a stalled response body after headers', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      const signal = init!.signal!;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        },
      });
      return new Response(body, { status: 200 });
    });
    const request = await cloudFetch();
    const response = await request('https://project.supabase.co/auth/v1/user');
    const rejected = expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
  });
});
