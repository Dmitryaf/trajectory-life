import { describe, expect, it } from 'vitest';
import { buildExperimentSummary } from '@/features/analytics/experimentComparison';
import {
  createExperimentRecord,
  emptyExperiment,
  experimentOverlapsRange,
  experimentPeriodsOverlap,
  linkLegacyExperimentEntries,
} from '@/features/experiments/model';
import { buildAiReportPayload, buildAiReportPrompt } from '@/features/export/report';
import { AI_REPORT_VERSION } from '@/model/dataVersions';
import { defaultSettings, emptyDailyEntry, type DailyEntry, type Experiment } from '@/types';

function entry(date: string, patch: Partial<DailyEntry>): DailyEntry {
  return { ...emptyDailyEntry(date), ...patch };
}

function experiment(patch: Partial<Experiment> = {}): Experiment {
  return {
    ...emptyExperiment(),
    id: 'experiment-evening',
    active: true,
    title: 'Спокойный вечер',
    hypothesis: 'Станет ли проще завершать день',
    startDate: '2026-07-05',
    endDate: '2026-07-08',
    ...patch,
  };
}

describe('experiment summary', () => {
  it('summarizes adherence and all available metrics without choosing a target', () => {
    const entries = [
      entry('2026-07-01', { energy: 2, sleepMinutes: 390 }),
      entry('2026-07-02', { energy: 2, sleepMinutes: 400 }),
      entry('2026-07-03', { energy: 5, sleepMinutes: 300, specialDay: 'travel' }),
      entry('2026-07-04', { energy: 2, sleepMinutes: 410 }),
      entry('2026-07-05', { energy: 3, sleepMinutes: 430, experimentId: 'experiment-evening', experimentCompleted: true }),
      entry('2026-07-06', { energy: 3, sleepMinutes: 440, experimentId: 'experiment-evening', experimentCompleted: true }),
      entry('2026-07-07', { energy: 3, sleepMinutes: 450, experimentId: 'experiment-evening', experimentCompleted: false }),
      entry('2026-07-09', { energy: 5, experimentId: 'experiment-evening', experimentCompleted: true }),
    ];

    const summary = buildExperimentSummary(entries, experiment());
    const energy = summary?.metrics.find((metric) => metric.id === 'energy');

    expect(summary).toMatchObject({
      baselineStart: '2026-07-01',
      baselineEnd: '2026-07-04',
      plannedDays: 4,
      adherenceMarkedDays: 3,
      adherenceCompletedDays: 2,
      adherenceNotCompletedDays: 1,
      adherenceUnmarkedDays: 1,
    });
    expect(energy).toMatchObject({ baselineAverage: 2, baselineSamples: 3, experimentAverage: 3, experimentSamples: 3, difference: 1 });
    expect(summary?.metrics.map((metric) => metric.id)).toEqual(['sleepMinutes', 'energy']);
  });

  it('requires only a valid period and preserves a free-form completed record', () => {
    expect(buildExperimentSummary([], experiment({ startDate: '', endDate: '' }))).toBeNull();
    const record = createExperimentRecord(experiment({ conclusion: 'Стало спокойнее', decision: 'continue' }), '2026-07-08T20:00:00.000Z');

    expect(record).toMatchObject({
      title: 'Спокойный вечер',
      conclusion: 'Стало спокойнее',
      decision: 'continue',
      completedAt: '2026-07-08T20:00:00.000Z',
    });
    expect(record).not.toHaveProperty('active');
    expect(experimentPeriodsOverlap(record, { startDate: '2026-07-08', endDate: '2026-07-10' })).toBe(true);
    expect(experimentPeriodsOverlap(record, { startDate: '2026-07-09', endDate: '2026-07-10' })).toBe(false);
    expect(experimentOverlapsRange(record, '2026-07-06', '2026-07-07')).toBe(true);
    expect(experimentOverlapsRange(record, '2026-07-09', '2026-07-10')).toBe(false);
  });

  it('does not guess which experiment owns an ambiguous legacy mark', () => {
    const settings = structuredClone(defaultSettings);
    settings.experiment = experiment({ id: 'active-experiment' });
    settings.experimentHistory = [
      createExperimentRecord(experiment({ id: 'completed-experiment', active: false }), '2026-07-08T20:00:00.000Z'),
    ];
    const legacyEntry = entry('2026-07-06', { experimentCompleted: true });

    expect(linkLegacyExperimentEntries([legacyEntry], settings)[0]!.experimentId).toBeNull();
  });

  it('includes user conclusions and a factual summary in the manual analysis package', () => {
    const entries = Array.from({ length: 8 }, (_, index) =>
      entry(`2026-07-${String(index + 1).padStart(2, '0')}`, {
        energy: index < 4 ? 2 : 3,
        experimentId: index < 4 ? null : 'experiment-evening',
        experimentCompleted: index < 4 ? null : true,
      }),
    );
    const settings = structuredClone(defaultSettings);
    const completed = experiment({ active: false, conclusion: 'Утром было немного легче', decision: 'more_data' });
    settings.experimentHistory = [createExperimentRecord(completed, '2026-07-08T20:00:00.000Z')];
    const payload = buildAiReportPayload('month', '2026-07-08', {
      entries,
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings,
    });

    expect(payload.version).toBe(AI_REPORT_VERSION);
    expect(payload.experimentHistory).toHaveLength(1);
    const prompt = buildAiReportPrompt(payload, settings);
    expect(prompt).toContain('вывод пользователя: Утром было немного легче');
    expect(prompt).toContain('Это фактическая сводка, а не автоматический вывод');
    expect(prompt).not.toContain('порог');
  });

  it('exports only experiments that overlap the requested period', () => {
    const settings = structuredClone(defaultSettings);
    settings.experiment = experiment({
      id: 'future-active',
      title: 'Будущий эксперимент',
      startDate: '2026-08-01',
      endDate: '2026-08-04',
    });
    settings.experimentHistory = [
      createExperimentRecord(
        experiment({ id: 'cross-week', active: false, startDate: '2026-07-05', endDate: '2026-07-14' }),
        '2026-07-14T20:00:00.000Z',
      ),
      createExperimentRecord(
        experiment({ id: 'past', active: false, startDate: '2026-06-20', endDate: '2026-06-23' }),
        '2026-06-23T20:00:00.000Z',
      ),
    ];

    const payload = buildAiReportPayload('week', '2026-07-08', {
      entries: [],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings,
    });

    expect(payload.experimentSummary).toBeNull();
    expect(payload.settingsSnapshot.experiment).toBeNull();
    expect(payload.experimentHistory.map(({ record }) => record.id)).toEqual(['cross-week']);

    const prompt = buildAiReportPrompt(payload, settings);
    expect(prompt).not.toContain('Будущий эксперимент');
    expect(prompt).toContain('Спокойный вечер');
  });
});
