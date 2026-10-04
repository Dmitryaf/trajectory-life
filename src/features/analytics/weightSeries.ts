import { addDays } from '@/services/dates';
import type { DailyEntry } from '@/types';

export type WeightSeriesRow = {
  date: string;
  weight: number | null;
  rolling: number | null;
};

export function buildWeightSeries(dates: string[], entries: DailyEntry[], dataThrough: string): WeightSeriesRow[] {
  const measurements = entries
    .filter((entry) => entry.date <= dataThrough && entry.specialDay === null && entry.weightKg !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightByDate = new Map(measurements.map((entry) => [entry.date, entry.weightKg as number]));

  return dates
    .filter((date) => date <= dataThrough)
    .map((date) => {
      const weight = weightByDate.get(date) ?? null;
      if (weight === null) {
        return { date, weight, rolling: null };
      }

      const windowStart = addDays(date, -6);
      const windowValues = measurements
        .filter((entry) => entry.date >= windowStart && entry.date <= date)
        .map((entry) => entry.weightKg as number);
      const rolling =
        windowValues.length >= 2 ? Math.round((windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length) * 10) / 10 : null;

      return { date, weight, rolling };
    });
}
