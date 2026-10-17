import { computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/stores/app';
import { emptyDailyEntry, emptyWeeklyReview } from '@/types';
import { useTodayContext } from '../useTodayContext';
import { reviewReminders } from '@/features/reviews/reminders';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('weekly plan period and optional reflection', () => {
  it.each([
    ['2026-07-19', '2026-07-06'],
    ['2026-07-20', '2026-07-13'],
    ['2026-07-26', '2026-07-13'],
    ['2026-07-27', '2026-07-20'],
  ])('shows only the preceding week plan on %s', (today, source) => {
    vi.setSystemTime(new Date(`${today}T12:00:00`));
    const store = useAppStore();
    store.weeklyReviews = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'].map((week) => ({
      ...emptyWeeklyReview(week),
      ifThenPlan: `План из ${week}`,
    }));
    const context = useTodayContext(
      store,
      computed(() => true),
    );
    expect(context.currentWeeklyPlan.value.plan).toBe(`План из ${source}`);
    expect(context.currentWeeklyPlan.value.source).toBe(`/week?week=${source}#week-review`);
  });

  it('does not carry an older plan across a missing or empty week and reacts to a late review', () => {
    vi.setSystemTime(new Date('2026-07-21T12:00:00'));
    const store = useAppStore();
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-06'), ifThenPlan: 'Устаревший план' }];
    const context = useTodayContext(
      store,
      computed(() => true),
    );
    expect(context.currentWeeklyPlan.value.plan).toBe('');
    store.weeklyReviews.push(emptyWeeklyReview('2026-07-13'));
    expect(context.currentWeeklyPlan.value.plan).toBe('');
    store.weeklyReviews[1]!.ifThenPlan = '  План из поздно заполненного обзора  ';
    expect(context.currentWeeklyPlan.value.plan).toBe('План из поздно заполненного обзора');
  });

  it('rechecks the source period when reviews refresh after the week changes', () => {
    vi.setSystemTime(new Date('2026-07-19T23:59:00'));
    const store = useAppStore();
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-06'), ifThenPlan: 'Прежний план' }];
    const context = useTodayContext(
      store,
      computed(() => true),
    );
    expect(context.currentWeeklyPlan.value.plan).toBe('Прежний план');
    vi.setSystemTime(new Date('2026-07-20T00:01:00'));
    store.weeklyReviews = [...store.weeklyReviews, { ...emptyWeeklyReview('2026-07-13'), ifThenPlan: 'Новый план' }];
    expect(context.currentWeeklyPlan.value.plan).toBe('Новый план');
    expect(context.currentWeeklyPlan.value.source).toContain('2026-07-13');
  });

  it.each([
    ['2026-07-26', 'week'],
    ['2026-07-31', 'month'],
  ])('invites reflection with only a text note on %s', (today, period) => {
    vi.setSystemTime(new Date(`${today}T12:00:00`));
    const store = useAppStore();
    store.dailyEntries = [{ ...emptyDailyEntry(today), importantFact: 'Запомнился разговор', specialDay: 'travel' }];
    // The same text-only fixture now invites reflection through navigation, independently of Today's selected date.
    expect(reviewReminders(store, today, {})[0]?.period).toBe(period);
    store.dailyEntries = [emptyDailyEntry(today)];
    expect(reviewReminders(store, today, {})).toEqual([]);
  });
});
