// @vitest-environment happy-dom
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';

const cloud = vi.hoisted(() => ({
  invalidate: vi.fn(),
  cached: vi.fn(),
  startup: vi.fn(),
  subscribe: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/services/cloudSync', () => ({
  isCloudSyncConfigured: () => true,
  isCloudAuthRequired: () => true,
  isSignupConfigured: () => false,
  getCachedCloudSession: cloud.cached,
  invalidateCachedCloudSession: cloud.invalidate,
  getStartupCloudSession: cloud.startup,
  onCloudAuthChange: cloud.subscribe,
  signInToCloud: cloud.signIn,
  signOutFromCloud: cloud.signOut,
}));
function session(id: string, token = id): Session {
  return { access_token: token, user: { id } } as Session;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let emit: (event: AuthChangeEvent, value: Session | null) => void;
let options: { onAuthRejected: (error: unknown, candidate: Session | null) => void };

describe('startup Auth decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    setActivePinia(createPinia());
    cloud.cached.mockReturnValue(session('A'));
    cloud.subscribe.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    cloud.signOut.mockResolvedValue(undefined);
  });
  function start() {
    const pending = deferred<Session | null>();
    cloud.startup.mockImplementation((value) => {
      options = value;
      return pending.promise;
    });
    const auth = useAuthStore();
    const init = auth.init();
    return { pending, auth, init };
  }
  it('does not accept SDK storage events before verification or after a rejected startup', async () => {
    const { auth, pending, init } = start();
    emit('SIGNED_IN', session('A'));
    emit('INITIAL_SESSION', session('A'));
    expect(auth.session).toBeNull();
    options.onAuthRejected(new Error('Invalid token'), session('A'));
    pending.reject(new Error('Invalid token'));
    await init;
    emit('SIGNED_IN', session('A'));
    emit('INITIAL_SESSION', session('A'));
    expect(auth.initialized).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.error).toBe('Invalid token');
  });
  it('does not let a token refreshed during SDK initialization bypass a startup rejection', async () => {
    const { auth, pending, init } = start();
    const refreshed = session('A', 'refreshed-during-startup');
    emit('TOKEN_REFRESHED', refreshed);
    emit('SIGNED_IN', refreshed);
    emit('INITIAL_SESSION', refreshed);
    options.onAuthRejected(new Error('Revoked'), refreshed);
    pending.reject(new Error('Revoked'));
    await init;
    emit('SIGNED_IN', refreshed);
    expect(auth.session).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });
  it('accepts the validated offline fallback and ignores a late initial SDK snapshot', async () => {
    const { auth, pending, init } = start();
    pending.resolve(session('A'));
    await init;
    emit('INITIAL_SESSION', session('B'));
    expect(auth.session?.user.id).toBe('A');
    expect(auth.isAuthenticated).toBe(true);
  });
  it('invalidates an accepted fallback on late rejection of its token', async () => {
    const { auth, pending, init } = start();
    pending.resolve(session('A'));
    await init;
    options.onAuthRejected(new Error('Revoked'), session('A'));
    emit('SIGNED_IN', session('A'));
    expect(auth.session).toBeNull();
    expect(auth.error).toBe('Revoked');
    expect(cloud.invalidate).toHaveBeenCalledWith(session('A'));
  });
  it.each(['success', 'failure'] as const)('preserves a new account after a late startup %s', async (result) => {
    const { auth, pending, init } = start();
    cloud.signIn.mockResolvedValue(session('B'));
    await auth.signIn('B@example.invalid', 'synthetic-password');
    options.onAuthRejected(new Error('Revoked A'), session('A'));
    if (result === 'success') {
      pending.resolve(session('A'));
    } else {
      pending.reject(new Error('Old startup failed'));
    }
    await init;
    expect(auth.session?.user.id).toBe('B');
    expect(auth.error).toBe('');
  });
  it('does not resurrect the cached session after sign-out', async () => {
    const { auth, pending, init } = start();
    await auth.signOut();
    emit('SIGNED_IN', session('A'));
    emit('INITIAL_SESSION', session('A'));
    pending.resolve(session('A'));
    await init;
    expect(auth.session).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });
  it('preserves a refreshed token when the old token is rejected later', async () => {
    const { auth, pending, init } = start();
    pending.resolve(session('A'));
    await init;
    emit('INITIAL_SESSION', session('A'));
    emit('TOKEN_REFRESHED', session('A', 'new-token'));
    options.onAuthRejected(new Error('Old token revoked'), session('A'));
    expect(auth.session?.access_token).toBe('new-token');
    expect(auth.error).toBe('');
    expect(cloud.invalidate).not.toHaveBeenCalled();
  });
  it('accepts a late SDK refresh after fallback even before INITIAL_SESSION', async () => {
    const { auth, pending, init } = start();
    pending.resolve(session('A'));
    await init;
    emit('TOKEN_REFRESHED', session('A', 'late-refreshed-token'));
    emit('SIGNED_IN', session('A', 'late-refreshed-token'));
    emit('INITIAL_SESSION', session('A', 'late-refreshed-token'));
    options.onAuthRejected(new Error('Old token revoked'), session('A'));
    expect(auth.session?.access_token).toBe('late-refreshed-token');
    expect(cloud.invalidate).not.toHaveBeenCalled();
  });
  it('keeps recovery in control when startup resolves later', async () => {
    const { auth, pending, init } = start();
    emit('PASSWORD_RECOVERY', session('B'));
    pending.resolve(session('A'));
    await init;
    expect(auth.session?.user.id).toBe('B');
    expect(auth.recoveryRequired).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
  });
  it('does not finish a newer sign-in operation in the startup finally block', async () => {
    const { auth, pending, init } = start();
    const login = deferred<Session | null>();
    cloud.signIn.mockReturnValue(login.promise);
    const signingIn = auth.signIn('B@example.invalid', 'synthetic-password');
    pending.resolve(session('A'));
    await init;
    expect(auth.operation).toBe('signing-in');
    login.resolve(session('B'));
    await signingIn;
    expect(auth.session?.user.id).toBe('B');
  });
});
