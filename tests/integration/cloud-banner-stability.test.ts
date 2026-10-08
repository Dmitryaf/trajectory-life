// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import ProductShell from '@/features/app-shell/ui/ProductShell.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
vi.mock('@/features/sync/startup', () => ({
  prepareLocalCacheOwner: vi.fn().mockResolvedValue(undefined),
  reconcileCloudSnapshotOnStartup: vi.fn().mockResolvedValue(undefined),
  reconcileCloudSnapshotAfterResume: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/features/sync/resume', () => ({ createResumeCloudRefresh: () => vi.fn().mockResolvedValue(false) }));
vi.mock('@/features/telemetry/useProductTelemetry', () => ({ useProductTelemetry: () => vi.fn() }));
vi.mock('@/services/cloudSync', async (original) => ({
  ...(await original<typeof import('@/services/cloudSync')>()),
  subscribeToCloudSnapshot: () => vi.fn(),
}));
vi.mock('@/services/errorMonitoring', () => ({ configureErrorMonitoring: () => vi.fn(), reportClientError: vi.fn() }));
vi.mock('@/services/notifications', () => ({ notifyInfo: vi.fn(), notifyUnknownError: vi.fn() }));
async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.configured = true;
  auth.authRequired = true;
  auth.initialized = true;
  auth.session = { user: { id: 'owner-1', email: 'synthetic@example.invalid' } } as typeof auth.session;
  vi.spyOn(auth, 'init').mockResolvedValue(undefined);
  const store = useAppStore();
  vi.spyOn(store, 'load').mockImplementation(async () => {
    store.loaded = true;
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/today', component: { template: '<h1>Сегодня</h1>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  });
  await router.push('/today');
  await router.isReady();
  const wrapper = mount(ProductShell, {
    slots: { default: '<p data-testid="entries">Локальные записи</p>' },
    global: {
      plugins: [pinia, router],
      stubs: {
        FeedbackDialog: true,
        ConsentExperience: { template: '<div data-testid="consent" />' },
        HowItWorksDialog: true,
        AccountMenu: true,
        Toaster: true,
      },
    },
  });
  await flushPromises();
  return { wrapper, store, auth };
}
describe('cloud warning is stable until the retry resolves', () => {
  it.each(['pending', 'conflict', 'error'] as const)(
    'keeps unresolved %s during repeated retry, then clears only on success',
    async (status) => {
      const { wrapper, store } = await setup();
      store.cloudSyncStatus = status;
      store.cloudSyncMessage = 'Нерешённая ошибка';
      await flushPromises();
      const original = wrapper.get('.sync-banner').element;
      for (let n = 0; n < 3; n++) {
        store.cloudSyncStatus = 'syncing';
        store.cloudSyncMessage = 'Сохраняю облачную копию…';
        await flushPromises();
        expect(wrapper.get('.sync-banner').element).toBe(original);
        expect(wrapper.get('.sync-banner').text()).toContain('Нерешённая ошибка');
        expect(wrapper.get('.sync-banner').classes()).toContain('sync-banner--' + status);
        expect(store.cloudSyncStatus).toBe('syncing');
        store.cloudSyncStatus = status;
        store.cloudSyncMessage = 'Нерешённая ошибка';
        await flushPromises();
        expect(wrapper.get('.sync-banner').element).toBe(original);
      }
      store.cloudSyncStatus = 'synced';
      await flushPromises();
      expect(wrapper.find('.sync-banner').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entries"]').exists()).toBe(true);
      wrapper.unmount();
    },
  );
  it('does not fabricate an error banner for a healthy save', async () => {
    const { wrapper, store } = await setup();
    store.cloudSyncStatus = 'synced';
    await flushPromises();
    store.cloudSyncStatus = 'syncing';
    await flushPromises();
    expect(wrapper.find('.sync-banner').exists()).toBe(false);
    wrapper.unmount();
  });
  it('clears previous owner warning before replacement data can mount', async () => {
    const { wrapper, store, auth } = await setup();
    store.cloudSyncStatus = 'pending';
    store.cloudSyncMessage = 'Предыдущий владелец';
    await flushPromises();
    expect(wrapper.text()).toContain('Предыдущий владелец');
    auth.session = { user: { id: 'owner-2' } } as typeof auth.session;
    await flushPromises();
    store.cloudSyncStatus = 'syncing';
    await flushPromises();
    expect(wrapper.find('.sync-banner').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Предыдущий владелец');
    wrapper.unmount();
  });
  it.each(['idle', 'disabled'] as const)('clears on explicit %s reset', async (status) => {
    const { wrapper, store } = await setup();
    store.cloudSyncStatus = 'error';
    store.cloudSyncMessage = 'Предыдущая ошибка';
    await flushPromises();
    store.cloudSyncStatus = status;
    await flushPromises();
    expect(wrapper.find('.sync-banner').exists()).toBe(false);
    wrapper.unmount();
  });
  it('clears warning on signout and cannot resurrect it through syncing', async () => {
    const { wrapper, store, auth } = await setup();
    store.cloudSyncStatus = 'conflict';
    store.cloudSyncMessage = 'Предыдущий владелец';
    await flushPromises();
    auth.session = null;
    await flushPromises();
    store.cloudSyncStatus = 'syncing';
    await flushPromises();
    expect(wrapper.find('.sync-banner').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Предыдущий владелец');
    wrapper.unmount();
  });
});
