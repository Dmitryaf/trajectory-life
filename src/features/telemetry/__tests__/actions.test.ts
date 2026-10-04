import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureDailySave } from '@/features/daily-entry/telemetry';
import { captureReviewSave } from '@/features/reviews/telemetry';
import { emptyDailyEntry, emptyWeeklyReview, emptyMonthlyReview, normalizeDailyEntry } from '@/types';

const { events } = vi.hoisted(() => ({ events: [] as { name: string; props: unknown }[] }));
vi.mock('../productTelemetry', () => ({ captureProductEvent: (name: string, props: unknown) => () => events.push({ name, props }) }));
beforeEach(() => {
  events.length = 0;
});
describe('explicit content-free action semantics', () => {
  it('ignores an empty daily record but counts explicit empty answers as recorded facts', () => {
    captureDailySave(emptyDailyEntry('2026-09-01'), [], false)();
    expect(events).toEqual([]);
    const entry = normalizeDailyEntry({
      ...emptyDailyEntry('2026-09-01'),
      energy: 3,
      importantFact: 'PRIVATE',
      recordedFields: ['activities'],
    });
    captureDailySave(entry, [], false)();
    expect(events).toEqual([
      { name: 'daily_entry_saved', props: { save_kind: 'created', recorded_field_count: 3, entry_count_bucket: '1' } },
    ]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
    expect(JSON.stringify(events)).not.toContain('energy');
  });
  it('counts available meaningful records without treating repeat saves as new entries', () => {
    const entries = ['01', '02', '03'].map((day) => normalizeDailyEntry({ ...emptyDailyEntry(`2026-09-${day}`), energy: 2 }));
    captureDailySave(entries[0], entries, true)();
    expect(events[0]).toMatchObject({ props: { save_kind: 'updated', entry_count_bucket: '3+' } });
  });
  it('ignores blank reviews and pending decisions; records only new explicit decisions', () => {
    captureReviewSave(emptyWeeklyReview('2026-09-07'))();
    expect(events).toEqual([]);
    const review = { ...emptyWeeklyReview('2026-09-07'), nextLever: 'Пока без решения' };
    captureReviewSave(review)();
    expect(events.map((event) => event.name)).toEqual(['week_review_saved']);
    events.length = 0;
    const next = { ...review, nextLever: 'Продолжить как есть' };
    captureReviewSave(next, review)();
    captureReviewSave(next, next)();
    expect(events.filter((event) => event.name === 'decision_saved')).toEqual([{ name: 'decision_saved', props: { period_type: 'week' } }]);
    captureReviewSave({ ...emptyMonthlyReview('2026-09-01'), courseChange: 'PRIVATE MONTH DECISION' })();
    expect(events.at(-1)).toEqual({ name: 'decision_saved', props: { period_type: 'month' } });
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
});
