import { describe, expect, it } from 'vitest';
import { emptyDailyEntry, type DailyEntry } from '@/types';
import { buildObservations, factorComparisonText, factorSummaries } from '../observations';
import { buildReviewCues } from '../reviewCues';

describe('sample sizes in analytical text', () => {
  it('keeps separate sleep and energy counts for both factor groups', () => {
    const entries: DailyEntry[] = Array.from({ length: 12 }, (_, index) => ({
      ...emptyDailyEntry(`2026-08-${String(index + 1).padStart(2, '0')}`),
      contextFactors: index < 5 ? ['screen'] : [],
      contextFactorsRecorded: true,
      sleepMinutes: index < 5 ? 480 : 420,
      energy: index < 5 ? 4 : 3,
    }));
    entries[0]!.sleepMinutes = null;
    entries[5]!.sleepMinutes = null;
    entries[1]!.energy = null;
    entries.push({ ...entries[0]!, date: '2026-08-13', specialDay: 'travel', sleepMinutes: 300, energy: 1 });
    const factor = factorSummaries(entries)[0]!;
    expect([factor.sleepSamples, factor.sleepSamplesWithout, factor.energySamples, factor.energySamplesWithout]).toEqual([4, 6, 4, 7]);
    expect(factorComparisonText(factor)).toContain('Сон с отметкой: 8 ч (измерений: 4), без отметки: 7 ч (измерений: 6)');
    expect(factorComparisonText(factor)).toContain('энергия с отметкой: 4 (измерений: 4), без отметки: 3 (измерений: 7)');
    expect(factorComparisonText(factor)).toContain('Разница не доказывает');
    expect(factorComparisonText({ ...factor, sleepSamples: 3, energySamples: 3 })).toBe('');
  });

  it('shows independent denominators for sleep, time in bed and their intersection', () => {
    const entries = [
      { ...emptyDailyEntry('2026-08-01'), sleepMinutes: 480, timeInBedMinutes: 600 },
      { ...emptyDailyEntry('2026-08-02'), sleepMinutes: 420 },
      { ...emptyDailyEntry('2026-08-03'), timeInBedMinutes: 600 },
      { ...emptyDailyEntry('2026-08-04'), specialDay: 'travel' as const, sleepMinutes: 300, timeInBedMinutes: 400 },
    ];
    const text = buildReviewCues('week', entries, [], []).find((cue) => cue.id === 'sleep-baseline')!.text;
    expect(text).toContain('7 ч 30 мин (измерений: 2)');
    expect(text).toContain('в кровати 10 ч (измерений: 2)');
    expect(text).toContain('доля сна около 80% (пар измерений: 1)');
  });

  it('shows unequal group sizes without counting unrecorded activity or sleep', () => {
    const entries: DailyEntry[] = Array.from({ length: 10 }, (_, index) => ({
      ...emptyDailyEntry(`2026-08-${String(index + 1).padStart(2, '0')}`),
      activities: index < 4 ? ['walk'] : [],
      activitiesRecorded: true,
      sleepMinutes: index < 4 ? 480 : 360,
      energy: index < 4 ? 5 : 2,
    }));
    entries.push({ ...emptyDailyEntry('2026-08-11'), activities: [], activitiesRecorded: false, sleepMinutes: null, energy: 1 });
    for (const id of ['movement-energy', 'sleep-energy']) {
      const text = buildObservations(entries).find((observation) => observation.id === id)!.text;
      expect(text).toContain('5 (измерений: 4)');
      expect(text).toContain('(измерений: 6)');
    }
  });
});
