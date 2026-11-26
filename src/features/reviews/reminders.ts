import { dataCoverageLevel } from '@/features/analytics/coverage';
import { addDays, endOfMonth, endOfWeek, formatDate, startOfMonth, startOfWeek, toDateKey } from '@/services/dates';
import type { DailyEntry, LifeEventRecord, MonthlyReview, ResultRecord, WeeklyReview } from '@/types';
import type { SelfReminder } from '@/model/selfReminder';
import { monthWeekReviews } from './monthWeeks';
import { reviewOpensOn, reviewPath, type ReviewPeriod } from './periods';
export type { ReviewPeriod } from './periods';
export type DismissedReviews = Partial<Record<ReviewPeriod, string>>;
export type ReviewReminder = { period: ReviewPeriod; start: string; to: string; label: string; dates: string };
export const reviewReminderStorageKey = 'trajectory:review-reminders:v2';
const legacyReminderStorageKey = 'trajectory:review-reminders:v1';
const periodBounds = {
  week: { start: startOfWeek, end: endOfWeek, label: 'Вспомнить неделю', format: formatWeek },
  month: {
    start: startOfMonth,
    end: endOfMonth,
    label: 'Вспомнить месяц',
    format: (date: string) => formatDate(date, { month: 'long', year: 'numeric' }),
  },
};

type ReviewData = {
  dailyEntries: DailyEntry[];
  results: ResultRecord[];
  lifeEvents: LifeEventRecord[];
  weeklyReviews: WeeklyReview[];
  monthlyReviews: MonthlyReview[];
  selfReminders?: readonly SelfReminder[];
};

function formatWeek(start: string, end: string) {
  const endLabel = formatDate(end);
  const startLabel = start.slice(0, 7) === end.slice(0, 7) ? String(Number(start.slice(-2))) : formatDate(start);
  return `${startLabel}–${endLabel}`;
}

export function reviewReminders(data: ReviewData, today: string, dismissed: DismissedReviews): ReviewReminder[] {
  return (['week', 'month'] as const).flatMap((period) => {
    const bounds = periodBounds[period];
    const current = bounds.start(today);
    const anchor = today >= reviewOpensOn(period, today) ? today : addDays(current, -1);
    const start = bounds.start(anchor);
    const end = bounds.end(anchor);
    if (dismissed[period] === start) {
      return [];
    }
    const saved =
      period === 'week'
        ? data.weeklyReviews.some((review) => review.weekStart === start)
        : data.monthlyReviews.some((review) => review.monthStart === start);
    const coveredEnd = end < today ? end : today;
    const inPeriod = (date: string) => date >= start && date <= coveredEnd;
    const hasData =
      (period === 'month' &&
        (data.selfReminders?.some((row) => toDateKey(new Date(row.createdAt)) <= coveredEnd) ||
          monthWeekReviews(data.weeklyReviews, start, coveredEnd).length > 0)) ||
      data.dailyEntries.some((entry) => inPeriod(entry.date) && dataCoverageLevel(entry) > 0) ||
      data.results.some((record) => inPeriod(record.date) && Boolean(record.title.trim() || record.note.trim())) ||
      data.lifeEvents.some((record) => inPeriod(record.date) && Boolean(record.title.trim() || record.note.trim()));
    return !saved && hasData
      ? [{ period, start, to: reviewPath(period, start, true), label: bounds.label, dates: bounds.format(start, end) }]
      : [];
  });
}

export function readDismissedReviews(owner: string, storage?: Pick<Storage, 'getItem'>): DismissedReviews {
  try {
    const value: unknown = JSON.parse((storage ?? window.localStorage).getItem(reviewReminderStorageKey) ?? 'null');
    if (!value || typeof value !== 'object' || !('owner' in value) || value.owner !== owner) {
      return {};
    }
    const dismissed: DismissedReviews = {};
    for (const period of ['week', 'month'] as const) {
      if (period in value) {
        const start = (value as Record<string, unknown>)[period];
        if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
          dismissed[period] = start;
        }
      }
    }
    return dismissed;
  } catch {
    return {};
  }
}

export function writeDismissedReviews(owner: string, dismissed: DismissedReviews, storage?: Pick<Storage, 'setItem'>) {
  try {
    // Only the current owner's two period keys are retained; no diary text or accumulated history.
    (storage ?? window.localStorage).setItem(reviewReminderStorageKey, JSON.stringify({ owner, ...dismissed }));
  } catch {
    // An optional reminder can still be dismissed in memory when browser storage is unavailable.
  }
}

export function clearDismissedReviews(owner: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>) {
  for (const key of [reviewReminderStorageKey, legacyReminderStorageKey]) {
    try {
      const target = storage ?? window.localStorage;
      const value: unknown = JSON.parse(target.getItem(key) ?? 'null');
      if (value && typeof value === 'object' && 'owner' in value && value.owner === owner) {
        target.removeItem(key);
      }
    } catch {
      // Optional browser preferences must not block successful account deletion.
    }
  }
}
