// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductShell from '@/features/app-shell/ui/ProductShell.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { getCloudSyncMeta, saveCloudSyncMeta, type CloudSnapshot } from '@/services/cloudSync';

const sync = vi.hoisted(() => ({
  prepareLocalCacheOwner: vi.fn(),
  reconcileCloudSnapshotAfterResume: vi.fn(),
  reconcileCloudSnapshotOnStartup: vi.fn(),
  sameSnapshotData: vi.fn(),
}));
const resume = vi.hoisted(() => ({
  refresh: undefined as (() => Promise<void>) | undefined,
  request: vi.fn().mockResolvedValue(false),
}));
const funnel = vi.hoisted(() => ({ clearFirstUseFunnel: vi.fn() }));
const cloud = vi.hoisted(() => ({
  callback: undefined as (() => void) | undefined,
  subscribe: vi.fn((_userId: string, callback: () => void) => {
    cloud.callback = callback;
    return vi.fn();
  }),
}));

vi.mock('@/features/sync/startup', () => sync);
vi.mock('@/features/first-use/funnel', () => funnel);
vi.mock('@/services/cloudSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/cloudSync')>()),
  subscribeToCloudSnapshot: cloud.subscribe,
}));
vi.mock('@/features/sync/resume', () => ({
  createResumeCloudRefresh: (refresh: () => Promise<void>) => {
    resume.refresh = refresh;
    return resume.request;
  },
}));
vi.mock('@/services/notifications', () => ({
  notifyInfo: vi.fn(),
  notifySaved: vi.fn(),
  notifyUnknownError: vi.fn(),
  notifyWarning: vi.fn(),
}));

describe('application startup', () => {
  it('returns an unauthenticated deep link to the sign-in entry route', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.configured = true;
    auth.authRequired = true;
    auth.initialized = true;
    auth.session = null;
    vi.spyOn(auth, 'init').mockResolvedValue(undefined);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/access', component: { template: '<div>Вход</div>' } },
        { path: '/today', component: { template: '<div>Сегодня</div>' } },
        { path: '/trends', component: { template: '<div>Тренды</div>' } },
        { path: '/password-reset', component: { template: '<div>Новый пароль</div>' } },
      ],
    });
    await router.push('/trends');
    await router.isReady();

    const wrapper = mount(ProductShell, {
      global: {
        plugins: [pinia, router],
        stubs: {
          FeedbackDialog: true,
          ConsentExperience: { template: '<div data-testid="consent-slot" />' },
          Toaster: true,
        },
      },
    });

    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/access?mode=sign-in');
    expect(wrapper.find('.auth-shell').exists()).toBe(true);
    expect(wrapper.find('.app-main').classes()).toContain('app-main--auth');
    wrapper.unmount();
  });

  it('does not mount working screens before the required cloud reconciliation finishes', async () => {
    let finishCloudCheck!: () => void;
    sync.prepareLocalCacheOwner.mockResolvedValue(undefined);
    sync.reconcileCloudSnapshotOnStartup.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCloudCheck = resolve;
        }),
    );

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.configured = true;
    auth.authRequired = true;
    auth.initialized = true;
    auth.session = { user: { id: 'user-1', email: 'friend@example.com' } } as typeof auth.session;
    vi.spyOn(auth, 'init').mockResolvedValue(undefined);

    const store = useAppStore();
    vi.spyOn(store, 'load').mockImplementation(async () => {
      store.loaded = true;
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/today', component: { template: '<div data-testid="working-screen">Записи</div>' } },
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    });
    await router.push('/today');
    await router.isReady();

    const wrapper = mount(ProductShell, {
      slots: { default: '<RouterView />' },
      global: {
        plugins: [pinia, router],
        stubs: {
          FeedbackDialog: true,
          ConsentExperience: { template: '<div data-testid="consent-slot" />' },
          Toaster: true,
        },
      },
    });

    await flushPromises();
    expect(store.loaded).toBe(true);
    expect(sync.reconcileCloudSnapshotOnStartup).toHaveBeenCalledWith(store, 'user-1');
    expect(wrapper.text()).toContain('Сверяю записи с облаком…');
    expect(wrapper.find('[data-testid="working-screen"]').exists()).toBe(false);
    expect(wrapper.find('.bottom-nav').exists()).toBe(false);
    expect(wrapper.find('[data-testid="consent-slot"]').exists()).toBe(false);

    finishCloudCheck();
    await flushPromises();

    expect(wrapper.find('[data-testid="working-screen"]').exists()).toBe(true);
    expect(wrapper.find('.bottom-nav').exists()).toBe(true);
    expect(wrapper.find('[data-testid="consent-slot"]').exists()).toBe(true);
    expect(funnel.clearFirstUseFunnel).toHaveBeenCalledOnce();
    expect(cloud.subscribe).toHaveBeenCalledWith('user-1', expect.any(Function));

    cloud.callback!();
    expect(resume.request).toHaveBeenCalledWith(expect.objectContaining({ authenticated: true, loaded: true }), true);

    store.cloudSyncStatus = 'conflict';
    store.cloudSyncMessage =
      'В облаке появились более свежие данные. Открытые записи не заменены. Выберите нужную копию в разделе «Данные и синхронизация».';
    await flushPromises();
    expect(wrapper.find('.sync-banner button').exists()).toBe(false);
    const cloudSettingsLink = wrapper.get('.sync-banner a');
    expect(cloudSettingsLink.text()).toBe('Настройки синхронизации');
    expect(cloudSettingsLink.attributes('href')).toBe('/settings#cloud-settings');

    const startupCalls = sync.reconcileCloudSnapshotOnStartup.mock.calls.length;
    await resume.refresh!();
    expect(sync.reconcileCloudSnapshotAfterResume).toHaveBeenCalledWith(store, 'user-1');
    expect(sync.reconcileCloudSnapshotOnStartup).toHaveBeenCalledTimes(startupCalls);

    // Direct A -> B switch remains authenticated, but must reload the correct owner's data.
    auth.session = { user: { id: 'user-2', email: 'second@example.com' } } as typeof auth.session;
    await flushPromises();
    expect(wrapper.find('[data-testid="working-screen"]').exists()).toBe(false);
    expect(sync.prepareLocalCacheOwner).toHaveBeenLastCalledWith(store, 'user-2');
    expect(sync.reconcileCloudSnapshotOnStartup).toHaveBeenLastCalledWith(store, 'user-2');
    finishCloudCheck();
    await flushPromises();
    expect(wrapper.find('[data-testid="working-screen"]').exists()).toBe(true);
    expect(cloud.subscribe).toHaveBeenLastCalledWith('user-2', expect.any(Function));
    wrapper.unmount();
  });
});

describe('bounded startup cloud reconciliation', () => {
  let startup: typeof import('@/features/sync/startup');

  beforeEach(async () => {
    startup = await vi.importActual<typeof import('@/features/sync/startup')>('@/features/sync/startup');
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.session = { user: { id: 'user-1' } } as typeof auth.session;
    window.localStorage.clear();
    saveCloudSyncMeta('user-1', {
      lastCloudRevision: 7,
      lastCloudUpdatedAt: '2026-10-05T10:00:00.000Z',
      lastSyncedAt: '2026-10-05T10:01:00.000Z',
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  function createReconciliation() {
    const store = useAppStore();
    const importLocalData = vi.spyOn(store, 'importLocalData').mockResolvedValue(undefined);
    const syncCloudSnapshot = vi
      .spyOn(store, 'syncCloudSnapshot')
      .mockResolvedValue({ status: 'synced', updatedAt: '2026-10-07T10:00:00.000Z' });
    const setCloudSyncState = vi.spyOn(store, 'setCloudSyncState');
    const services = {
      loadSnapshot: vi.fn<() => Promise<CloudSnapshot | null>>().mockResolvedValue(null),
      loadBase: vi.fn().mockResolvedValue(null),
      getMeta: getCloudSyncMeta,
      markConflict: vi.fn(),
      markSynced: vi.fn(),
    };
    return { store, services, importLocalData, syncCloudSnapshot, setCloudSyncState };
  }

  it.each([false, true])('keeps persisted pending/conflict metadata unchanged while offline (conflict=%s)', async (conflict) => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    saveCloudSyncMeta('user-1', { pending: true, conflict });
    const metaBefore = getCloudSyncMeta('user-1');
    const { store, services, importLocalData, syncCloudSnapshot, setCloudSyncState } = createReconciliation();
    store.settings.activeFocusTitle = 'Локальная цель';
    const localBefore = { ...store.exportData(), exportedAt: '' };

    await startup.reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(services.loadSnapshot).not.toHaveBeenCalled();
    expect(services.loadBase).not.toHaveBeenCalled();
    expect(importLocalData).not.toHaveBeenCalled();
    expect(syncCloudSnapshot).not.toHaveBeenCalled();
    expect(services.markConflict).not.toHaveBeenCalled();
    expect(services.markSynced).not.toHaveBeenCalled();
    expect(getCloudSyncMeta('user-1')).toEqual(metaBefore);
    expect({ ...store.exportData(), exportedAt: '' }).toEqual(localBefore);
    expect(setCloudSyncState).toHaveBeenCalledWith(conflict ? 'conflict' : 'pending', expect.any(String), {
      error: 'Нет соединения с сетью',
    });
  });

  it.each(['reconcileCloudSnapshotOnStartup', 'reconcileCloudSnapshotAfterResume'] as const)(
    'finishes a stalled %s after five seconds and ignores its late snapshot',
    async (reconcile) => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
      vi.useFakeTimers();
      const { store, services, importLocalData, syncCloudSnapshot, setCloudSyncState } = createReconciliation();
      const metaBefore = getCloudSyncMeta('user-1');
      const localBefore = { ...store.exportData(), exportedAt: '' };
      let finish!: (snapshot: CloudSnapshot) => void;
      services.loadSnapshot.mockImplementation(
        () =>
          new Promise<CloudSnapshot>((resolve) => {
            finish = resolve;
          }),
      );
      const finished = vi.fn();
      const reconciliation = startup[reconcile](store, 'user-1', services).then(finished);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(finished).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await reconciliation;

      expect(finished).toHaveBeenCalledOnce();
      expect(setCloudSyncState).toHaveBeenCalledWith('pending', expect.any(String), {
        error: 'Не удалось проверить облако за 5 секунд',
      });
      expect(vi.getTimerCount()).toBe(0);
      finish({
        userId: 'user-1',
        revision: 8,
        updatedAt: '2026-10-07T10:00:00.000Z',
        payload: { ...localBefore, settings: { ...store.settings, activeFocusTitle: 'Поздняя облачная цель' } },
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(importLocalData).not.toHaveBeenCalled();
      expect(syncCloudSnapshot).not.toHaveBeenCalled();
      expect(services.loadBase).not.toHaveBeenCalled();
      expect(services.markConflict).not.toHaveBeenCalled();
      expect(services.markSynced).not.toHaveBeenCalled();
      expect(setCloudSyncState).toHaveBeenCalledOnce();
      expect(getCloudSyncMeta('user-1')).toEqual(metaBefore);
      expect({ ...store.exportData(), exportedAt: '' }).toEqual(localBefore);
    },
  );
});
