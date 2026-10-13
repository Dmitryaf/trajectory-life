import { describe, expect, it } from 'vitest';
import { emptyDailyEntry, type DailyEntry } from '@/types';
import { buildRangeReviewCues, buildReviewCues, selectPrimaryReviewCues } from '../reviewCues';

describe('primary observations', () => {
  it('does not fill the grid with counters or insufficient comparisons for a text-only diary', () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({
      ...emptyDailyEntry(`2026-07-${13 + i}`),
      importantFact: 'Обычная запись',
      contextFactors: ['news'],
    }));
    expect(selectPrimaryReviewCues(buildReviewCues('week', entries, [], []))).toEqual([]);
    expect(selectPrimaryReviewCues(buildRangeReviewCues(3, entries, [], []))).toEqual([]);
  });

  it('prefers an eligible comparison to the most frequent factor without weakening the four-per-group threshold', () => {
    const entries: DailyEntry[] = Array.from({ length: 8 }, (_, i) => ({
      ...emptyDailyEntry(`2026-07-${13 + i}`),
      recordedFields: ['contextFactors', 'energy'],
      contextFactors: i < 4 ? ['news', 'screen'] : ['news'],
      energy: i < 4 ? 4 : 2,
    }));
    for (const cues of [buildReviewCues('month', entries, [], []), buildRangeReviewCues(3, entries, [], [])]) {
      const primary = selectPrimaryReviewCues(cues);
      expect(primary).toHaveLength(1);
      expect(primary[0]!.id).toBe('factor');
      expect(primary[0]!.text).toContain('Экранное время');
      expect(primary[0]!.text).toContain('измерений: 4');
      expect(primary[0]!.text).toContain('не доказывает');
    }
    entries[0]!.specialDay = 'travel';
    expect(selectPrimaryReviewCues(buildReviewCues('month', entries, [], []))).toEqual([]);
  });
});
