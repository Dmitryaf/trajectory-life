// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import ProductShell from '@/features/app-shell/ui/ProductShell.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

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
