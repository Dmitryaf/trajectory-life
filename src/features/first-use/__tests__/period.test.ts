import { describe, expect, it } from 'vitest';
import { firstUsePeriodOptions, recommendedFirstUsePeriod } from '../period';

describe('first-use period choice', () => {
  it.each([
    ['2026-08-10', 'previous', '2026-08-03', '2026-08-09'],
    ['2026-08-12', 'previous', '2026-08-03', '2026-08-09'],
    ['2026-08-13', 'current', '2026-08-10', '2026-08-13'],
    ['2026-08-15', 'current', '2026-08-10', '2026-08-15'],
    ['2026-08-16', 'current', '2026-08-10', '2026-08-16'],
  ])('recommends a useful calendar period on %s', (today, id, weekStart, periodEnd) => {
    expect(recommendedFirstUsePeriod(today)).toMatchObject({ id, weekStart, periodEnd });
  });

  it('never puts future days into the current option across a year boundary', () => {
    const [current, previous] = firstUsePeriodOptions('2027-01-01');

    expect(current).toMatchObject({ weekStart: '2026-12-28', periodEnd: '2027-01-01', coveredDays: 5, completed: false });
    expect(previous).toMatchObject({ weekStart: '2026-12-21', periodEnd: '2026-12-27', coveredDays: 7, completed: true });
  });
});
