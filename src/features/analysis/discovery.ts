import { summarize } from '@/features/analytics/periodSummary';
import type { DailyEntry } from '@/types';

export const aiAnalysisNudgeEntryThreshold = 3;

export function shouldShowAiAnalysisNudge(entries: DailyEntry[], dismissed: boolean): boolean {
  return !dismissed && summarize(entries).coveredEntriesCount >= aiAnalysisNudgeEntryThreshold;
}
