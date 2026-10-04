import { describe, expect, it } from 'vitest';
import { dateRange, endOfMonth, startOfMonth } from '@/services/dates';
import { emptyDailyEntry } from '@/types';
import { buildWeightSeries } from '../weightSeries';

describe('monthly weight series', () => {
  it('shows rolling values only on actual measurement dates through the data boundary', () => {
    const entries = [
      { ...emptyDailyEntry('2026-07-16'), weightKg: 88 },
      { ...emptyDailyEntry('2026-07-18'), weightKg: 88.2 },
      { ...emptyDailyEntry('2026-07-20'), weightKg: 87.4 },
      { ...emptyDailyEntry('2026-07-21'), weightKg: 87.1 },
    ];
    const dates = dateRange(startOfMonth('2026-07-20'), endOfMonth('2026-07-20'));

    const rows = buildWeightSeries(dates, entries, '2026-07-20');

    expect(rows.at(-1)?.date).toBe('2026-07-20');
    expect(rows.find((row) => row.date === '2026-07-17')).toMatchObject({ weight: null, rolling: null });
    expect(rows.find((row) => row.date === '2026-07-18')).toMatchObject({ weight: 88.2, rolling: 88.1 });
    expect(rows.find((row) => row.date === '2026-07-20')).toMatchObject({ weight: 87.4, rolling: 87.9 });
    expect(rows.some((row) => row.date === '2026-07-21')).toBe(false);
  });

  it('excludes special-day measurements from the baseline window', () => {
    const special = { ...emptyDailyEntry('2026-07-19'), weightKg: 100, specialDay: 'sick' as const };
    const rows = buildWeightSeries(
      ['2026-07-18', '2026-07-19', '2026-07-20'],
      [{ ...emptyDailyEntry('2026-07-18'), weightKg: 88 }, special, { ...emptyDailyEntry('2026-07-20'), weightKg: 87 }],
      '2026-07-20',
    );

    expect(rows[1]).toMatchObject({ weight: null, rolling: null });
    expect(rows[2]).toMatchObject({ weight: 87, rolling: 87.5 });
  });
});
