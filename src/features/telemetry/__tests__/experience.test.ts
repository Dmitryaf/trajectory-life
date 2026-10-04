// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConsentExperience from '../ui/ConsentExperience.vue';
import { consentOfferKind } from '../consentEligibility';
import { telemetryState, productTelemetry } from '../productTelemetry';
import type { TelemetryState } from '../queue';
const { store, route } = vi.hoisted(() => ({
  store: { cloudSyncStatus: 'idle', settings: { firstUse: { status: 'not_started' } }, dailyEntries: [], weeklyReviews: [] },
  route: { path: '/today' },
}));
vi.mock('@/stores/app', () => ({ useAppStore: () => store }));
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('../productTelemetry', () => ({
  telemetryCollectionEnabled: true,
  telemetryState: reactive<TelemetryState>({ available: true, enabled: false, busy: false, pendingWithdrawal: false, message: '' }),
  productTelemetry: { offer: vi.fn(), snooze: vi.fn(), withdraw: vi.fn(), grant: vi.fn() },
}));
const fresh = () => ({
  available: true,
  enabled: false,
  busy: false,
  pendingWithdrawal: false,
  message: '',
  decision: 'undecided' as const,
  firstOfferedAt: null,
  snoozedUntil: null,
  reminderCount: 0,
  serverNow: Date.parse('2026-09-12T00:00:00Z'),
});
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(telemetryState, fresh());
  store.cloudSyncStatus = 'idle';
  store.settings.firstUse.status = 'not_started';
  route.path = '/today';
  vi.mocked(productTelemetry.offer).mockResolvedValue(true);
});
describe('first contact and reminder eligibility', () => {
  it('shows equal opt-in/later choices without enabling collection', async () => {
    const wrapper = mount(ConsentExperience);
    await flushPromises();
    expect(wrapper.text()).toContain('Помочь улучшать Траекторию?');
    expect(productTelemetry.grant).not.toHaveBeenCalled();
    await wrapper.findAll('button')[1].trigger('click');
    await nextTick();
    expect(productTelemetry.snooze).toHaveBeenCalledOnce();
    expect(wrapper.find('section').exists()).toBe(false);
    wrapper.unmount();
  });
  it('does not offer on the public landing', async () => {
    route.path = '/';
    const wrapper = mount(ConsentExperience);
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each(['pending', 'conflict', 'error', 'syncing'])('does not offer during %s', async (status) => {
    store.cloudSyncStatus = status;
    const wrapper = mount(ConsentExperience);
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not offer after first-use input started', async () => {
    store.settings.firstUse.status = 'in_progress';
    const wrapper = mount(ConsentExperience);
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not reveal a delayed response after interaction with an editor', async () => {
    let resolve!: (value: boolean) => void;
    vi.mocked(productTelemetry.offer).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const wrapper = mount(ConsentExperience);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    resolve(true);
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
    input.remove();
    wrapper.unmount();
  });
  it('allows only one reminder after seven days and real experience; decline survives subsequent eligibility checks', () => {
    const state: TelemetryState = {
      ...fresh(),
      decision: 'snoozed',
      firstOfferedAt: '2026-09-01T00:00:00Z',
      snoozedUntil: '2026-09-08T00:00:00Z',
    };
    expect(consentOfferKind(state, false)).toBeNull();
    expect(consentOfferKind(state, true)).toBe('reminder');
    expect(consentOfferKind({ ...state, serverNow: Date.parse('2026-09-07') }, true)).toBeNull();
    expect(consentOfferKind({ ...state, reminderCount: 1 }, true)).toBeNull();
    expect(consentOfferKind({ ...state, decision: 'declined' }, true)).toBeNull();
    expect(consentOfferKind({ ...state, pendingWithdrawal: true }, true)).toBeNull();
    expect(consentOfferKind({ ...state, decision: undefined }, true)).toBeNull();
  });
  it('allows and declines through explicit actions', async () => {
    vi.mocked(productTelemetry.grant).mockImplementation(async () => {
      telemetryState.enabled = true;
    });
    let wrapper = mount(ConsentExperience);
    await flushPromises();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
    wrapper.unmount();
    Object.assign(telemetryState, fresh());
    wrapper = mount(ConsentExperience);
    await flushPromises();
    await wrapper.findAll('button')[2].trigger('click');
    expect(productTelemetry.withdraw).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
