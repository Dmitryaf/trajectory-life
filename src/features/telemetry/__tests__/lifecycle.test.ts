// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { useProductTelemetry } from '../useProductTelemetry';
import { emitProductEvent, telemetryState } from '../productTelemetry';

const auth = reactive({ session: { user: { id: 'a' }, access_token: 'token-a' } });
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../productTelemetry', async () => {
  const { reactive } = await import('vue');
  return {
    telemetryState: reactive({ enabled: false }),
    emitProductEvent: vi.fn(),
    productTelemetry: { setSession: vi.fn(), flush: vi.fn(), stop: vi.fn(), storageChanged: vi.fn() },
  };
});

describe('loaded application and route events', () => {
  it('waits for data and consent, emits once per real route entry, and ignores query/hash rerenders', async () => {
    const ready = ref(false);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    });
    await router.push('/week');
    const wrapper = mount(
      defineComponent({
        setup() {
          useProductTelemetry(() => ready.value);
          return {};
        },
        template: '<div />',
      }),
      { global: { plugins: [router] } },
    );
    await flushPromises();
    expect(emitProductEvent).not.toHaveBeenCalled();
    telemetryState.enabled = true;
    await flushPromises();
    expect(emitProductEvent).not.toHaveBeenCalled();
    ready.value = true;
    await flushPromises();
    expect(vi.mocked(emitProductEvent).mock.calls.map((call) => call[0])).toEqual(['app_opened', 'week_opened']);
    await router.push('/week?week=2026-09-01#review');
    await flushPromises();
    expect(emitProductEvent).toHaveBeenCalledTimes(2);
    await router.push('/month');
    await flushPromises();
    await router.push('/trends');
    await flushPromises();
    await router.push('/more');
    await flushPromises();
    await router.push('/week');
    await flushPromises();
    expect(vi.mocked(emitProductEvent).mock.calls.map((call) => call[0])).toEqual([
      'app_opened',
      'week_opened',
      'month_opened',
      'history_opened',
      'journal_opened',
      'week_opened',
    ]);
    ready.value = false;
    auth.session = { user: { id: 'b' }, access_token: 'token-b' };
    await flushPromises();
    ready.value = true;
    await flushPromises();
    expect(
      vi
        .mocked(emitProductEvent)
        .mock.calls.slice(-2)
        .map((call) => call[0]),
    ).toEqual(['app_opened', 'week_opened']);
    wrapper.unmount();
  });
});
