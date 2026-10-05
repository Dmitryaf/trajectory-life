// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { recordedEvents } = vi.hoisted(() => ({ recordedEvents: [] as string[] }));
vi.mock('@/features/telemetry/productTelemetry', () => ({
  captureProductEvent: (name: string) => () => recordedEvents.push(name),
  emitProductEvent: (name: string) => recordedEvents.push(name),
  productTelemetry: { clearDeletedAccount: vi.fn() },
}));
import FirstUseRecovery from '../ui/FirstUseRecovery.vue';
import { useAppStore } from '@/stores/app';
import { defaultSettings, emptyWeeklyReview, type AppSettings, type WeeklyReview } from '@/types';

function setupStore() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAppStore();
  store.settings = structuredClone(defaultSettings);
  store.saveSettings = vi.fn(async (settings: AppSettings) => {
    store.settings = structuredClone(settings);
  });
  store.saveReview = vi.fn(async (review: WeeklyReview) => {
    const index = store.weeklyReviews.findIndex((item) => item.weekStart === review.weekStart);
    if (index >= 0) {
      store.weeklyReviews[index] = structuredClone(review);
    } else {
      store.weeklyReviews.push(structuredClone(review));
    }
  });
  return { pinia, store };
}

describe('first-use week recovery', () => {
  beforeEach(() => {
    recordedEvents.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 8, 12));
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('recommends the current week near its end and saves its real boundary', async () => {
    const { pinia, store } = setupStore();
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    expect(wrapper.text()).toContain('С чего начнём?');
    expect(wrapper.text()).toContain('3 августа — 8 августа 2026 г.');
    expect(wrapper.text()).toContain('27 июля — 2 августа 2026 г.');
    expect(wrapper.get('[role="radio"][aria-checked="true"]').text()).toContain('Эта неделя');
    await wrapper.get('.first-use-retrospective .secondary-button').trigger('click');

    expect(store.settings.firstUse).toMatchObject({
      status: 'in_progress',
      weekStart: '2026-08-03',
      periodEnd: '2026-08-08',
      lastStep: 'results',
    });
    expect(recordedEvents).toContain('first_use_started');
    expect(wrapper.text()).toContain('Что вам удалось закончить или получить?');
  });

  it('recommends the completed week on Monday but lets the user choose the current one', async () => {
    vi.setSystemTime(new Date(2026, 7, 10, 12));
    const { pinia, store } = setupStore();
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    expect(wrapper.get('[role="radio"][aria-checked="true"]').text()).toContain('Прошлая неделя');
    await wrapper
      .findAll('[role="radio"]')
      .find((option) => option.text().includes('Эта неделя'))!
      .trigger('click');
    await wrapper.get('.first-use-retrospective .secondary-button').trigger('click');

    expect(store.settings.firstUse).toMatchObject({ weekStart: '2026-08-10', periodEnd: '2026-08-10' });
  });

  it('keeps the choice visible when starting cannot be saved', async () => {
    const { pinia, store } = setupStore();
    store.saveSettings = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    await wrapper.get('.first-use-retrospective .secondary-button').trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Не удалось начать. Попробуйте ещё раз.'));

    expect(store.settings.firstUse.status).toBe('not_started');
    expect(wrapper.text()).toContain('С чего начнём?');
    expect(wrapper.get('.first-use-retrospective .secondary-button').attributes('disabled')).toBeUndefined();
    expect(recordedEvents).not.toContain('first_use_started');
  });

  it('saves an answer in the weekly review before opening the next step', async () => {
    const { pinia, store } = setupStore();
    const weekStart = '2026-07-27';
    store.settings.firstUse = {
      status: 'in_progress',
      weekStart,
      periodEnd: '2026-08-02',
      lastStep: 'results',
      overviewSeen: false,
      updatedAt: '',
    };
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    await wrapper.get('#first-use-results').setValue('Закончил черновик\nОтправил письмо');
    await wrapper.get('.first-use-recovery__footer .primary-button').trigger('click');

    expect(store.saveReview).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart, coveredThrough: '2026-08-02', results: ['Закончил черновик', 'Отправил письмо'] }),
    );
    expect(store.settings.firstUse.lastStep).toBe('highlights');
    expect(wrapper.text()).toContain('Что важного произошло?');
    expect(wrapper.get('#first-use-highlights').attributes('placeholder')).toBeUndefined();
  });

  it('keeps an unsaved answer on the same step and allows retrying', async () => {
    const { pinia, store } = setupStore();
    const weekStart = '2026-07-27';
    store.settings.firstUse = {
      status: 'in_progress',
      weekStart,
      periodEnd: '2026-08-02',
      lastStep: 'results',
      overviewSeen: false,
      updatedAt: '',
    };
    vi.mocked(store.saveReview).mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    await wrapper.get('#first-use-results').setValue('Ответ не должен пропасть');
    await wrapper.get('.first-use-recovery__footer .primary-button').trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Не удалось сохранить ответ'));

    expect(store.settings.firstUse.lastStep).toBe('results');
    expect((wrapper.get('#first-use-results').element as HTMLTextAreaElement).value).toBe('Ответ не должен пропасть');

    await wrapper.get('.first-use-recovery__footer .primary-button').trigger('click');
    await vi.waitFor(() => expect(store.settings.firstUse.lastStep).toBe('highlights'));
    expect(store.reviewByWeek(weekStart)?.results).toEqual(['Ответ не должен пропасть']);
  });

  it('keeps existing answers when a step is skipped', async () => {
    const { pinia, store } = setupStore();
    const weekStart = '2026-07-27';
    store.settings.firstUse = {
      status: 'in_progress',
      weekStart,
      periodEnd: '2026-08-02',
      lastStep: 'highlights',
      overviewSeen: false,
      updatedAt: '',
    };
    store.weeklyReviews = [{ ...emptyWeeklyReview(weekStart), highlights: ['Важный разговор'] }];
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    await wrapper
      .findAll('.first-use-card__text-button')
      .find((button) => button.text() === 'Пропустить')!
      .trigger('click');

    expect(store.saveReview).not.toHaveBeenCalled();
    expect(store.reviewByWeek(weekStart)?.highlights).toEqual(['Важный разговор']);
    expect(store.settings.firstUse.lastStep).toBe('state_context');
  });

  it('shows saved answers together and completes only a useful overview', async () => {
    const { pinia, store } = setupStore();
    const weekStart = '2026-07-27';
    store.settings.firstUse = {
      status: 'in_progress',
      weekStart,
      periodEnd: '2026-08-02',
      lastStep: 'overview',
      overviewSeen: true,
      updatedAt: '',
    };
    store.weeklyReviews = [
      {
        ...emptyWeeklyReview(weekStart),
        results: ['Закончил черновик'],
        highlights: ['Поговорил с другом'],
        nextLever: 'Пока без решения',
      },
    ];
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    expect(wrapper.text()).toContain('Ваш обзор недели');
    expect(wrapper.text()).toContain('Закончил черновик');
    expect(wrapper.text()).toContain('Поговорил с другом');
    expect(recordedEvents).toContain('first_use_overview_viewed');
    expect(wrapper.get('.first-use-recovery__footer .primary-button').attributes('disabled')).toBeUndefined();
    await wrapper.get('.first-use-recovery__footer .primary-button').trigger('click');

    expect(store.saveReview).toHaveBeenLastCalledWith(
      expect.objectContaining({ weekStart, results: ['Закончил черновик'], highlights: ['Поговорил с другом'] }),
    );
    expect(store.settings.firstUse).toMatchObject({ status: 'completed', lastStep: 'overview', overviewSeen: true });
  });

  it('explains how the next-week change will be used later', async () => {
    const { pinia, store } = setupStore();
    store.settings.firstUse = {
      status: 'in_progress',
      weekStart: '2026-07-27',
      periodEnd: '2026-08-02',
      lastStep: 'decision',
      overviewSeen: false,
      updatedAt: '',
    };
    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });

    await wrapper.findAll('.first-use-recovery__choices button')[1]!.trigger('click');

    expect(wrapper.text()).toContain('Какое одно изменение хотите попробовать?');
    expect(wrapper.text()).toContain('этот ответ появится как ваше прошлое решение');
  });

  it('reopens completed answers when editing is requested from the week overview', async () => {
    window.history.replaceState({}, '', '/today?first-use=edit');
    const { pinia, store } = setupStore();
    store.settings.firstUse = {
      status: 'completed',
      weekStart: '2026-07-27',
      periodEnd: '2026-08-02',
      lastStep: 'overview',
      overviewSeen: true,
      updatedAt: '',
    };
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-27'), results: ['Закончил черновик'] }];

    const wrapper = mount(FirstUseRecovery, { global: { plugins: [pinia] } });
    await vi.waitFor(() => expect(store.settings.firstUse.status).toBe('in_progress'));

    expect(store.settings.firstUse).toMatchObject({ lastStep: 'results', overviewSeen: true });
    expect(wrapper.text()).toContain('Что вам удалось закончить или получить?');
    expect((wrapper.get('#first-use-results').element as HTMLTextAreaElement).value).toBe('Закончил черновик');
  });
});
