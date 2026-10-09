import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { cloudSessionStorageKey, hasAuthenticatedStoredSession, installAuthenticatedLandingRedirect } from '../publicEntry';

describe('authenticated public entry', () => {
  it('checks only the current Supabase project session and skips auth loading without it', async () => {
    const storage = { getItem: vi.fn().mockReturnValue(null) };
    const loadSession = vi.fn();

    expect(cloudSessionStorageKey('https://project-ref.supabase.co')).toBe('sb-project-ref-auth-token');
    await expect(hasAuthenticatedStoredSession({ storage, supabaseUrl: 'https://project-ref.supabase.co', loadSession })).resolves.toBe(
      false,
    );
    expect(storage.getItem).toHaveBeenCalledWith('sb-project-ref-auth-token');
    expect(loadSession).not.toHaveBeenCalled();

    storage.getItem.mockReturnValue('{"access_token":"cached"}');
    loadSession.mockResolvedValue({ user: { id: 'user-1' } });
    await expect(hasAuthenticatedStoredSession({ storage, supabaseUrl: 'https://project-ref.supabase.co', loadSession })).resolves.toBe(
      true,
    );
  });

  it('opens Today when the stored session is still authenticated', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Лендинг</div>' } },
        { path: '/today', component: { template: '<div>Сегодня</div>' } },
      ],
    });
    installAuthenticatedLandingRedirect(router, vi.fn().mockResolvedValue(true));

    await router.push('/');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/today');
  });

  it('keeps the landing available when a stored session is invalid', async () => {
    await expect(
      hasAuthenticatedStoredSession({
        storage: { getItem: () => 'stale-session' },
        supabaseUrl: 'https://project-ref.supabase.co',
        loadSession: vi.fn().mockRejectedValue(new Error('Invalid session')),
      }),
    ).resolves.toBe(false);
  });

  it('keeps the data policy available without checking or redirecting the current session', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Лендинг</div>' } },
        { path: '/data-policy', component: { template: '<div>Политика конфиденциальности</div>' } },
        { path: '/today', component: { template: '<div>Сегодня</div>' } },
      ],
    });
    const session = vi.fn().mockResolvedValue(true);
    installAuthenticatedLandingRedirect(router, session);
    await router.push('/#data-policy');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/data-policy');
    await router.push('/data-policy');
    expect(router.currentRoute.value.fullPath).toBe('/data-policy');
    expect(session).not.toHaveBeenCalled();
  });
});
