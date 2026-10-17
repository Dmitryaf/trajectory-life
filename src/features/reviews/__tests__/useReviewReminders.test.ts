// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/stores/app';
import { emptyDailyEntry } from '@/types';
import { provideReviewReminders, useViewedReview } from '../useReviewReminders';
import { readViewedReviews } from '../reminders';

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-31T12:00:00'));
});
afterEach(() => vi.useRealTimers());

it('acknowledges the mounted period after data is ready, survives reload and isolates owners', async () => {
  const store = useAppStore();
  store.dailyEntries = [{ ...emptyDailyEntry('2026-10-31'), importantFact: 'Заметка' }];
  const owner = ref('alice');
  const ready = ref(false);
  const start = ref('2026-10-19');
  const Reader = {
    setup() {
      useViewedReview('week', start);
      return () => h('div');
    },
  };
  let context!: ReturnType<typeof provideReviewReminders>;
  const Host = {
    setup() {
      context = provideReviewReminders(store, owner, ready);
      return () => h(Reader);
    },
  };
  let wrapper = mount(Host);
  expect(context.reminders.value).toEqual([]);
  ready.value = true;
  await nextTick();
  expect(context.reminders.value).toHaveLength(2);
  start.value = '2026-10-26';
  await nextTick();
  expect(context.destination.value).toBe('/month');
  expect(readViewedReviews('alice')).toEqual({ week: '2026-10-26' });
  wrapper.unmount();
  wrapper = mount(Host);
  expect(context.reminders.value.map((item) => item.period)).toEqual(['month']);
  start.value = '2026-10-19';
  owner.value = 'bob';
  await nextTick();
  expect(context.reminders.value).toHaveLength(2);
  wrapper.unmount();
});

it('refreshes the reminder window on resume and does not dismiss while loading failed', async () => {
  const store = useAppStore();
  store.dailyEntries = [{ ...emptyDailyEntry('2026-10-30'), importantFact: 'Заметка' }];
  vi.setSystemTime(new Date('2026-10-30T23:59:00'));
  const ready = ref(false);
  let context!: ReturnType<typeof provideReviewReminders>;
  const Host = {
    setup() {
      context = provideReviewReminders(store, ref('alice'), ready);
      return () => h('div');
    },
  };
  const wrapper = mount(Host);
  context.markViewed('month', '2026-10-01');
  expect(readViewedReviews('alice')).toEqual({});
  ready.value = true;
  expect(context.reminders.value.map((item) => item.period)).toEqual(['month']);
  vi.setSystemTime(new Date('2026-10-31T00:01:00'));
  window.dispatchEvent(new Event('focus'));
  expect(context.reminders.value.map((item) => item.period)).toEqual(['week', 'month']);
  vi.setSystemTime(new Date('2026-11-02T00:01:00'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(context.reminders.value).toEqual([]);
  wrapper.unmount();
});
