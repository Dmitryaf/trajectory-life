import { describe, expect, it } from 'vitest';
import { emptyMonthlyReview, emptyWeeklyReview } from '@/types';
import { monthlyTimeline, weeklyTimeline } from '../reviewTimeline';

describe('time and meaning of a review', () => {
  it('keeps a later edit attached to its original month, without inferring a decision from an observation', () => {
    const review = { ...emptyMonthlyReview('2026-01-01'), obstacle: 'Дорога занимала много времени', updatedAt: '2026-10-03T12:00:00Z' };
    const items = monthlyTimeline(review, '2026-10-04');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      date: '2026-01-31',
      updatedDate: '2026-10-03',
      tone: 'observation',
      title: review.obstacle,
      to: '/month?month=2026-01-01#month-review',
    });
    expect(monthlyTimeline({ ...review, nextFocus: 'Менять время поездки' }, '2026-10-04').map((item) => item.tone)).toEqual([
      'observation',
      'decision',
    ]);
  });

  it('uses the covered weekly period, preserves the follow-up and keeps deferral out of decisions', () => {
    const review = {
      ...emptyWeeklyReview('2026-03-02'),
      coveredThrough: '2026-03-05',
      previousPlanOutcome: 'Удалось',
      nextLever: 'Пока без решения',
    };
    expect(weeklyTimeline(review, '2026-03-20')).toMatchObject([
      { date: '2026-03-05', tone: 'outcome', to: '/week?week=2026-03-02#week-review' },
    ]);
    expect(monthlyTimeline(emptyMonthlyReview('2026-03-01'), '2026-03-07')).toEqual([]);
  });
});
