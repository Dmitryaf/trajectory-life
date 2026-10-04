import { normalizeDailyEntry, type DailyEntry } from '@/types';
import { dataCoverageLevel } from '@/features/analytics/coverage';
import { captureProductEvent } from '@/features/telemetry/productTelemetry';

export function captureDailySave(entry: DailyEntry, entries: DailyEntry[], existing: boolean): () => void {
  if (!dataCoverageLevel(entry)) {
    return () => {};
  }
  const count = entries.filter((saved) => saved.date !== entry.date && dataCoverageLevel(saved) > 0).length + 1;
  let bucket: '1' | '2' | '3+' = '3+';
  if (count === 1) {
    bucket = '1';
  }
  if (count === 2) {
    bucket = '2';
  }
  return captureProductEvent('daily_entry_saved', {
    save_kind: existing ? 'updated' : 'created',
    recorded_field_count: normalizeDailyEntry(entry).recordedFields.length,
    entry_count_bucket: bucket,
  });
}
