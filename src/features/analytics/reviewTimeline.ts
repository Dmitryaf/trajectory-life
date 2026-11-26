import { endOfMonth, endOfWeek, formatDate, toDateKey } from '@/services/dates';
import type { MonthlyReview, WeeklyReview } from '@/types';
import { weeklyDecisionText } from '@/features/reviews/decisionText';

export type TimelineTone = 'event' | 'result' | 'decision' | 'observation' | 'outcome' | 'experiment';
export type TimelineItem = {
  key: string;
  date: string;
  type: string;
  tone: TimelineTone;
  title: string;
  detail: string;
  to: string;
  period?: string;
  updatedDate?: string;
};

function reviewPeriod(start: string, end: string, updatedAt: string, today: string) {
  const updated = new Date(updatedAt);
  const updatedDate = Number.isNaN(updated.getTime()) ? '' : toDateKey(updated);
  return {
    date: end > today ? today : end,
    period: `${formatDate(start)} — ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    updatedDate,
  };
}

export function weeklyTimeline(review: WeeklyReview, today: string): TimelineItem[] {
  const start = review.weekStart;
  if (start > today) {
    return [];
  }
  const period = reviewPeriod(start, review.coveredThrough || endOfWeek(start), review.updatedAt, today);
  const to = `/week?week=${start}#week-review`;
  const items: TimelineItem[] = [];
  const observation = [review.stateContext, review.support, review.obstacle, ...review.highlights, ...review.results].find(Boolean);
  if (observation) {
    items.push({
      ...period,
      to,
      key: `week:${start}:observation`,
      tone: 'observation',
      type: 'Наблюдение недели',
      title: observation,
      detail: '',
    });
  }
  const decision = weeklyDecisionText(review);
  if (decision || review.ifThenPlan) {
    items.push({
      ...period,
      to,
      key: `week:${start}:decision`,
      tone: 'decision',
      type: 'Решение недели',
      title: decision || review.ifThenPlan,
      detail: decision ? review.ifThenPlan : '',
    });
  }
  if (review.previousPlanOutcome) {
    items.push({
      ...period,
      to,
      key: `week:${start}:outcome`,
      tone: 'outcome',
      type: 'Проверка решения',
      title: review.previousPlanOutcome,
      detail: '',
    });
  }
  return items;
}

export function monthlyTimeline(review: MonthlyReview, today: string): TimelineItem[] {
  const start = review.monthStart;
  if (start > today) {
    return [];
  }
  const period = reviewPeriod(start, endOfMonth(start), review.updatedAt, today);
  const to = `/month?month=${start}#month-review`;
  const items: TimelineItem[] = [];
  const observation = [review.mainPattern, review.courseChange, review.support, review.obstacle].find(Boolean);
  if (observation) {
    items.push({
      ...period,
      to,
      key: `month:${start}:observation`,
      tone: 'observation',
      type: 'Наблюдение месяца',
      title: observation,
      detail: '',
    });
  }
  if (review.nextFocus || review.ifThenPlan) {
    items.push({
      ...period,
      to,
      key: `month:${start}:decision`,
      tone: 'decision',
      type: 'Решение месяца',
      title: review.nextFocus || review.ifThenPlan,
      detail: review.nextFocus ? review.ifThenPlan : '',
    });
  }
  return items;
}
