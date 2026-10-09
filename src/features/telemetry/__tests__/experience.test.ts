// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsentExperience from '../ui/ConsentExperience.vue';
import { consentOfferKind } from '../consentEligibility';
import { telemetryState, productTelemetry } from '../productTelemetry';
import type { TelemetryState } from '../queue';
import { emptyDailyEntry, type DailyEntry } from '@/types';
import { setSyncEditorDirty } from '@/features/sync/editing';
const { store, route } = vi.hoisted(() => ({
  store: {
    cloudSyncStatus: 'idle',
    settings: { firstUse: { status: 'not_started' } },
    dailyEntries: [] as DailyEntry[],
    weeklyReviews: [],
  },
  route: { path: '/today' },
}));
vi.mock('@/stores/app', () => ({ useAppStore: () => reactive(store) }));
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('../productTelemetry', () => ({
  telemetryCollectionEnabled: true,
  telemetryState: reactive<TelemetryState>({ available: true, enabled: false, busy: false, pendingWithdrawal: false, message: '' }),
  productTelemetry: { offer: vi.fn(), snooze: vi.fn(), withdraw: vi.fn(), grant: vi.fn() },
}));
const testStore = reactive(store);
const wrappers: ReturnType<typeof mount>[] = [];
function mountExperience() {
  const wrapper = mount(ConsentExperience, { attachTo: document.body, global: { stubs: { teleport: true } } });
  wrappers.push(wrapper);
  return wrapper;
}
function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text)!;
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    wrapper.unmount();
  }
  document.body.innerHTML = '';
  setSyncEditorDirty('first-record-test', false);
});
describe('modal consent presentation', () => {
  it('keeps essential information and removes only the requested explanation', async () => {
    const wrapper = mountExperience();
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(wrapper.text()).toContain('До согласия события не');
    expect(wrapper.text()).toContain('События старше 90 дней');
    expect(wrapper.text()).toContain('Это необязательно');
    expect(wrapper.text()).not.toContain('Если выбрать «Не сейчас»');
    expect(wrapper.text()).not.toContain('Без сети сбор на этом устройстве');
    expect(wrapper.text()).not.toContain('Другие устройства узнают');
    expect(wrapper.text()).not.toContain('Предпочтение и время предложения');
  });
  it.each(['syncing', 'pending', 'conflict', 'error'])('retains the same already-open dialog during %s', async (status) => {
    const wrapper = mountExperience();
    await flushPromises();
    const panel = wrapper.get('[role="dialog"]').element;
    testStore.cloudSyncStatus = status;
    await nextTick();
    expect(wrapper.get('[role="dialog"]').element).toBe(panel);
    expect(productTelemetry.offer).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('hidden');
    testStore.cloudSyncStatus = 'synced';
    await nextTick();
    expect(wrapper.get('[role="dialog"]').element).toBe(panel);
  });
  it('does not offer while another modal is open', async () => {
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    const wrapper = mountExperience();
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
  it('does not reveal a delayed response over another modal', async () => {
    let resolve!: (value: boolean) => void;
    vi.mocked(productTelemetry.offer).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const wrapper = mountExperience();
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    resolve(true);
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(productTelemetry.grant).not.toHaveBeenCalled();
  });
  it.each(['escape', 'close', 'backdrop'])('dismisses through %s as Not now, with no grant or decline', async (method) => {
    const wrapper = mountExperience();
    await flushPromises();
    if (method === 'escape') {
      await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    }
    if (method === 'close') {
      await wrapper.get('button[aria-label="Не сейчас"]').trigger('click');
    }
    if (method === 'backdrop') {
      await wrapper.get('.dialog-backdrop').trigger('pointerdown', { pointerId: 1 });
      await wrapper.get('.dialog-backdrop').trigger('pointerup', { pointerId: 1 });
    }
    await flushPromises();
    expect(productTelemetry.snooze).toHaveBeenCalledOnce();
    expect(productTelemetry.grant).not.toHaveBeenCalled();
    expect(productTelemetry.withdraw).not.toHaveBeenCalled();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
  it('does not dismiss when dragging from inside onto the backdrop', async () => {
    const wrapper = mountExperience();
    await flushPromises();
    await wrapper.get('h2').trigger('pointerdown', { pointerId: 1 });
    await wrapper.get('.dialog-backdrop').trigger('pointerup', { pointerId: 1 });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(productTelemetry.snooze).not.toHaveBeenCalled();
  });
  it('traps Tab including details and returns focus to the previous trigger', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const wrapper = mountExperience();
    await flushPromises();
    const first = wrapper.get('button[aria-label="Не сейчас"]');
    const last = wrapper.get('summary');
    expect(document.activeElement).toBe(first.element);
    await first.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last.element);
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first.element);
    await first.trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
  });
  it('returns automatic-offer focus to the content heading and releases body lock on unmount', async () => {
    const main = document.createElement('main');
    main.className = 'app-main';
    main.innerHTML = '<h1>Записи</h1>';
    document.body.append(main);
    const wrapper = mountExperience();
    await flushPromises();
    await wrapper.get('button[aria-label="Не сейчас"]').trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(main.querySelector('h1'));
    expect(document.body.style.overflow).toBe('');
    Object.assign(telemetryState, fresh());
    const another = mountExperience();
    await flushPromises();
    expect(document.body.style.overflow).toBe('hidden');
    another.unmount();
    expect(document.body.style.overflow).toBe('');
  });
  it('allows dismissing the final reminder without scheduling another offer', async () => {
    Object.assign(telemetryState, { firstOfferedAt: '2026-09-01T00:00:00Z', snoozedUntil: '2026-09-08T00:00:00Z', decision: 'snoozed' });
    testStore.settings.firstUse.status = 'completed';
    const wrapper = mountExperience();
    await flushPromises();
    expect(productTelemetry.offer).toHaveBeenCalledWith('reminder');
    telemetryState.reminderCount = 1;
    await wrapper.get('button[aria-label="Не сейчас"]').trigger('click');
    expect(productTelemetry.snooze).toHaveBeenCalledOnce();
    expect(consentOfferKind(telemetryState, true)).toBeNull();
  });
});
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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.assign(telemetryState, fresh());
  store.cloudSyncStatus = 'idle';
  store.settings.firstUse.status = 'not_started';
  store.dailyEntries = [{ ...emptyDailyEntry('2026-10-09'), importantFact: 'Синтетическая запись' }];
  store.weeklyReviews = [];
  route.path = '/today';
  vi.mocked(productTelemetry.offer).mockResolvedValue(true);
});
describe('first contact and reminder eligibility', () => {
  it('waits for the first saved record even after first-use is completed, then waits until editing and sync finish', async () => {
    testStore.dailyEntries = [];
    testStore.settings.firstUse.status = 'completed';
    const input = document.createElement('textarea');
    document.body.append(input);
    input.focus();
    setSyncEditorDirty('first-record-test', true);
    const wrapper = mountExperience();
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    expect(consentOfferKind(fresh(), false)).toBeNull();
    testStore.dailyEntries = [{ ...emptyDailyEntry('2026-10-09'), importantFact: 'Первая сохранённая запись' }];
    testStore.cloudSyncStatus = 'syncing';
    setSyncEditorDirty('first-record-test', false);
    input.blur();
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    testStore.cloudSyncStatus = 'synced';
    await flushPromises();
    expect(productTelemetry.offer).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(productTelemetry.grant).not.toHaveBeenCalled();
  });
  it('shows equal opt-in/later choices without enabling collection', async () => {
    const wrapper = mountExperience();
    await flushPromises();
    expect(wrapper.text()).toContain('Помочь улучшать Траекторию?');
    expect(productTelemetry.grant).not.toHaveBeenCalled();
    await button(wrapper, 'Не сейчас').trigger('click');
    await nextTick();
    expect(productTelemetry.snooze).toHaveBeenCalledOnce();
    expect(wrapper.find('section').exists()).toBe(false);
    wrapper.unmount();
  });
  it('does not offer on the public landing', async () => {
    route.path = '/';
    const wrapper = mountExperience();
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each(['pending', 'conflict', 'error', 'syncing'])('does not offer during %s', async (status) => {
    store.cloudSyncStatus = status;
    const wrapper = mountExperience();
    await flushPromises();
    expect(productTelemetry.offer).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not offer after first-use input started', async () => {
    store.settings.firstUse.status = 'in_progress';
    const wrapper = mountExperience();
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
    const wrapper = mountExperience();
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
    let wrapper = mountExperience();
    await flushPromises();
    await button(wrapper, 'Разрешить').trigger('click');
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
    wrapper.unmount();
    Object.assign(telemetryState, fresh());
    wrapper = mountExperience();
    await flushPromises();
    await button(wrapper, 'Не предлагать').trigger('click');
    expect(productTelemetry.withdraw).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
