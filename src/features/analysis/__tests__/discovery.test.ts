import { describe, expect, it } from 'vitest';
import { emptyDailyEntry } from '@/types';
import { shouldShowAiAnalysisNudge } from '../discovery';

describe('AI analysis discovery', () => {
  it('waits for three filled days and stays hidden after dismissal', () => {
    const entries = [
      { ...emptyDailyEntry('2026-08-18'), importantFact: 'Первый день' },
      { ...emptyDailyEntry('2026-08-19'), energy: 3 },
      { ...emptyDailyEntry('2026-08-20'), actionDirection: 'external' as const },
    ];

    expect(shouldShowAiAnalysisNudge(entries.slice(0, 2), false)).toBe(false);
    expect(shouldShowAiAnalysisNudge(entries, false)).toBe(true);
    expect(shouldShowAiAnalysisNudge(entries, true)).toBe(false);
  });
});
