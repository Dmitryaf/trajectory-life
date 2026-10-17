import { dataCoverageLevel } from '@/features/analytics/coverage';
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '@/services/dates';
import type { DailyEntry, LifeEventRecord, MonthlyReview, ResultRecord, WeeklyReview } from '@/types';

export type ReviewPeriod = 'week' | 'month';
export type ViewedReviews = Partial<Record<ReviewPeriod, string>>;
export type ReviewReminder = { period: ReviewPeriod; start: string; to: string; label: string };
export const reviewReminderStorageKey = 'trajectory:review-reminders:v1';

type ReviewData = {
  dailyEntries: DailyEntry[];
  results: ResultRecord[];
  lifeEvents: LifeEventRecord[];
  weeklyReviews: WeeklyReview[];
  monthlyReviews: MonthlyReview[];
};

export function reviewReminders(data: ReviewData, today: string, viewed: ViewedReviews): ReviewReminder[] {
  return (['week', 'month'] as const).flatMap((period) => {
    const start = period === 'week' ? startOfWeek(today) : startOfMonth(today);
    const end = period === 'week' ? endOfWeek(today) : endOfMonth(today);
    if (today < addDays(end, period === 'week' ? -1 : -2) || viewed[period] === start) {
      return [];
    }
    const saved =
      period === 'week'
        ? data.weeklyReviews.some((review) => review.weekStart === start)
        : data.monthlyReviews.some((review) => review.monthStart === start);
    const inPeriod = (date: string) => date >= start && date <= today;
    const hasData =
      data.dailyEntries.some((entry) => inPeriod(entry.date) && dataCoverageLevel(entry) > 0) ||
      data.results.some((record) => inPeriod(record.date) && Boolean(record.title.trim() || record.note.trim())) ||
      data.lifeEvents.some((record) => inPeriod(record.date) && Boolean(record.title.trim() || record.note.trim()));
    return !saved && hasData
      ? [{ period, start, to: `/${period}`, label: period === 'week' ? 'Можно вспомнить неделю' : 'Можно вспомнить месяц' }]
      : [];
  });
}

export function readViewedReviews(owner: string, storage?: Pick<Storage, 'getItem'>): ViewedReviews {
  try {
    const value: unknown = JSON.parse((storage ?? window.localStorage).getItem(reviewReminderStorageKey) ?? 'null');
    if (!value || typeof value !== 'object' || !('owner' in value) || value.owner !== owner) {
      return {};
    }
    const viewed: ViewedReviews = {};
    for (const period of ['week', 'month'] as const) {
      if (period in value) {
        const start = (value as Record<string, unknown>)[period];
        if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
          viewed[period] = start;
        }
      }
    }
    return viewed;
  } catch {
    return {};
  }
}

export function writeViewedReviews(owner: string, viewed: ViewedReviews, storage?: Pick<Storage, 'setItem'>) {
  try {
    // Only the current owner's two period keys are retained; no diary text or accumulated history.
    (storage ?? window.localStorage).setItem(reviewReminderStorageKey, JSON.stringify({ owner, ...viewed }));
  } catch {
    // An optional reminder can still be dismissed in memory when browser storage is unavailable.
  }
}

export function clearViewedReviews(owner: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>) {
  try {
    const target = storage ?? window.localStorage;
    const value: unknown = JSON.parse(target.getItem(reviewReminderStorageKey) ?? 'null');
    if (value && typeof value === 'object' && 'owner' in value && value.owner === owner) {
      target.removeItem(reviewReminderStorageKey);
    }
  } catch {
    // Optional browser preferences must not block successful account deletion.
  }
}
