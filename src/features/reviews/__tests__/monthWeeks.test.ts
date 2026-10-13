import { describe, expect, it } from 'vitest';
import { emptyWeeklyReview } from '@/types';
import { monthWeekReviews } from '../monthWeeks';

describe('weekly reflection in a month', () => {
  it('includes meaningful overlapping weeks in date order without inventing missing weeks', () => {
    const reviews = [
      { ...emptyWeeklyReview('2026-07-27'), previousPlanOutcome: 'Решил оставить как есть' },
      { ...emptyWeeklyReview('2026-06-29'), support: 'Помог отдых' },
      emptyWeeklyReview('2026-07-06'),
      { ...emptyWeeklyReview('2026-08-03'), nextLever: 'Следующий месяц' },
      { ...emptyWeeklyReview('2026-06-22'), nextLever: 'Прошлый месяц' },
    ];
    const before = structuredClone(reviews);
    const weeks = monthWeekReviews(reviews, '2026-07-01', '2026-07-31');
    expect(weeks.map((week) => week.review.weekStart)).toEqual(['2026-06-29', '2026-07-27']);
    expect(weeks.every((week) => week.crossesMonth)).toBe(true);
    expect(weeks[1]!.fields).toEqual([{ label: 'Проверка прежнего решения', text: 'Решил оставить как есть' }]);
    expect(reviews).toEqual(before);
  });

  it('respects the known end of a reconstructed week and does not call the current week a neighbouring month', () => {
    const weeks = monthWeekReviews(
      [
        { ...emptyWeeklyReview('2026-06-29'), coveredThrough: '2026-06-30', support: 'Только июнь' },
        { ...emptyWeeklyReview('2026-07-20'), coveredThrough: '2026-07-21', highlights: ['Важная мысль'] },
        { ...emptyWeeklyReview('2026-07-27'), nextLever: 'Будущая неделя' },
      ],
      '2026-07-01',
      '2026-07-21',
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.crossesMonth).toBe(false);
    expect(weeks[0]!.fields[0]!.text).toBe('Важная мысль');
  });
});
