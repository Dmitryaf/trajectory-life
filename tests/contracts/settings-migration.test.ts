import { describe, expect, it } from 'vitest';
import { contextFactorLabel } from '@/features/analytics/presentation';
import { contextFactorOptions, normalizeDailyEntry, normalizeSettings, normalizeWeeklyReview } from '@/types';
import { SETTINGS_VERSION } from '@/model/dataVersions';

describe('settings migrations', () => {
  it('removes obsolete demo options while preserving old response entries', () => {
    const settings = normalizeSettings({
      settingsVersion: 3,
      customCareerOptions: [{ id: 'custom:career:responses', label: 'Адресные отклики' }],
      customEveningFactorOptions: [{ id: 'custom:evening:shower', label: 'Спокойный душ' }],
    });
    const normalized = normalizeDailyEntry({
      date: '2026-07-13',
      careerStates: ['preparation', 'custom:career:responses'],
      eveningFactors: ['screen', 'custom:evening:shower'],
    });

    expect(settings.customCareerOptions).toEqual([]);
    expect(settings.settingsVersion).toBe(SETTINGS_VERSION);
    expect(settings.introSeen).toBe(false);
    expect(settings.aiAnalysisNudgeDismissed).toBe(false);
    expect(settings.firstUse.status).toBe('available');
    expect(settings.activeDailyBlocks).toContain('context');
    expect(settings.activeDailyBlocks).toContain('career');
    expect(settings.customContextFactorOptions).toEqual([]);
    expect(settings.hiddenContextFactorIds).toEqual([]);
    expect(settings).not.toHaveProperty('customEveningFactorOptions');
    expect(normalized.careerStates).toEqual(['preparation', 'external']);
    expect(normalized.contextFactors).toEqual(['screen']);
    expect(normalized).not.toHaveProperty('eveningFactors');
  });

  it('preserves dismissal of the one-time external analysis hint', () => {
    expect(normalizeSettings({ aiAnalysisNudgeDismissed: true }).aiAnalysisNudgeDismissed).toBe(true);
  });

  it('keeps work optional for a new account without changing old account settings', () => {
    expect(normalizeSettings(undefined).activeDailyBlocks).not.toContain('career');
    expect(normalizeSettings({ settingsVersion: 10 }).activeDailyBlocks).toContain('career');
    expect(normalizeSettings(undefined).firstUse.status).toBe('not_started');
    expect(normalizeSettings({ settingsVersion: 11 }).firstUse.status).toBe('available');
  });

  it('preserves resumable first-use progress and rejects an invalid recovery week', () => {
    const inProgress = normalizeSettings({
      settingsVersion: 12,
      firstUse: {
        status: 'in_progress',
        weekStart: '2026-07-20',
        periodEnd: '2026-07-24',
        lastStep: 'state_context',
        overviewSeen: false,
        updatedAt: '2026-07-27T10:00:00.000Z',
      },
    });
    const invalid = normalizeSettings({
      settingsVersion: 12,
      firstUse: {
        status: 'in_progress',
        weekStart: '20.07.2026',
        periodEnd: '2026-07-24',
        lastStep: 'highlights',
        overviewSeen: false,
        updatedAt: '',
      },
    });

    expect(inProgress.firstUse).toEqual({
      status: 'in_progress',
      weekStart: '2026-07-20',
      periodEnd: '2026-07-24',
      lastStep: 'state_context',
      overviewSeen: false,
      updatedAt: '2026-07-27T10:00:00.000Z',
    });
    expect(invalid.firstUse).toEqual(expect.objectContaining({ status: 'available', weekStart: '', lastStep: 'choice' }));
  });

  it('gives old first-use progress its completed calendar-week boundary', () => {
    const settings = normalizeSettings({
      settingsVersion: 12,
      firstUse: {
        status: 'completed',
        weekStart: '2026-07-20',
        lastStep: 'overview',
        overviewSeen: true,
        updatedAt: '',
      },
    });

    expect(settings.firstUse.periodEnd).toBe('2026-07-26');
  });

  it('keeps only an evidenced boundary inside the review week', () => {
    expect(normalizeWeeklyReview({ weekStart: '2026-07-20', coveredThrough: '2026-07-24' }).coveredThrough).toBe('2026-07-24');
    expect(normalizeWeeklyReview({ weekStart: '2026-07-20', coveredThrough: '2026-07-27' }).coveredThrough).toBe('');
    expect(normalizeWeeklyReview({ weekStart: '2026-07-20' }).coveredThrough).toBe('');
  });

  it('keeps optional goal evidence and ignores an invalid review date', () => {
    const settings = normalizeSettings({
      focusOutcomeCriterion: 'Пять завершённых тренировок',
      focusReviewDate: '2026-08-01',
    });
    const invalid = normalizeSettings({ focusReviewDate: '01.08.2026' });

    expect(settings).toMatchObject({
      focusOutcomeCriterion: 'Пять завершённых тренировок',
      focusReviewDate: '2026-08-01',
    });
    expect(invalid.focusReviewDate).toBe('');
  });

  it('combines old context notes without dropping either value', () => {
    const normalized = normalizeDailyEntry({
      date: '2026-07-14',
      stateContext: 'Шум за окном',
      eveningFactorNote: 'Поздно выпил кофе',
    });

    expect(normalized.contextNote).toBe('Шум за окном\nПоздно выпил кофе');
  });

  it('infers only evidenced legacy answers and keeps historical block visibility unknown', () => {
    const normalized = normalizeDailyEntry({
      date: '2026-07-15',
      energy: 4,
      careerStates: ['external'],
      activities: [],
      activitiesRecorded: true,
    });

    expect(normalized.entrySchemaVersion).toBeNull();
    expect(normalized.activeDailyBlocksSnapshot).toBeNull();
    expect(normalized.recordedFields).toEqual(expect.arrayContaining(['energy', 'careerStates', 'activities']));
    expect(normalized.recordedFields).not.toContain('nutritionState');
  });

  it('keeps an optional experiment note without inventing it for older entries', () => {
    const oldEntry = normalizeDailyEntry({ date: '2026-07-15', experimentCompleted: false });
    const notedEntry = normalizeDailyEntry({
      date: '2026-07-16',
      experimentCompleted: true,
      experimentNote: 'Подготовил всё заранее',
    });

    expect(oldEntry.experimentNote).toBe('');
    expect(oldEntry.experimentId).toBeNull();
    expect(oldEntry.recordedFields).not.toContain('experimentNote');
    expect(notedEntry.experimentNote).toBe('Подготовил всё заранее');
    expect(notedEntry.recordedFields).toContain('experimentNote');
  });

  it('links an unambiguous legacy experiment metric without guessing a combined metric', () => {
    const energy = normalizeSettings({ experiment: { ...normalizeSettings(undefined).experiment, targetMetric: 'Энергия' } });
    const combined = normalizeSettings({
      experiment: { ...normalizeSettings(undefined).experiment, targetMetric: 'Энергия и качество сна' },
    });

    expect(energy.experiment).toMatchObject({ targetMetricId: 'energy', minimumMeaningfulChange: 0.5 });
    expect(combined.experiment.targetMetricId).toBeNull();
  });

  it('discards invalid experiment dates and incomplete history records', () => {
    const defaultExperiment = normalizeSettings(undefined).experiment;
    const { active: _active, ...defaultRecord } = defaultExperiment;
    const settings = normalizeSettings({
      experiment: { ...defaultExperiment, title: 'Режим', startDate: '22.07.2026', endDate: '2026-07-29' },
      experimentHistory: [
        { ...defaultRecord, id: 'invalid', title: 'Старая запись', startDate: '2026-07-30', endDate: '2026-07-20', completedAt: '' },
        {
          ...defaultRecord,
          id: 'valid',
          title: 'Спокойный вечер',
          startDate: '2026-07-01',
          endDate: '2026-07-07',
          conclusion: 'Стало легче завершать день',
          completedAt: '',
        },
      ],
    });

    expect(settings.experiment.startDate).toBe('');
    expect(settings.experiment.endDate).toBe('2026-07-29');
    expect(settings.experiment.id).toBe('');
    expect(settings.experimentHistory).toEqual([expect.objectContaining({ id: 'valid', title: 'Спокойный вечер' })]);
  });

  it('gives a legacy active experiment a stable identity', () => {
    const settings = normalizeSettings({
      experiment: {
        ...normalizeSettings(undefined).experiment,
        active: true,
        title: 'Спокойное утро',
        startDate: '2026-07-20',
        endDate: '2026-07-27',
      },
    });

    expect(settings.experiment.id).toBe('legacy-active-2026-07-20-2026-07-27');
  });

  it('moves an active legacy personal area into user options', () => {
    const settings = normalizeSettings({
      activeLifeAreas: ['family', 'english'],
      customLifeAreaOptions: [],
    });

    expect(settings.activeLifeAreas).toEqual(['family', 'english']);
    expect(settings.customLifeAreaOptions).toContainEqual(
      expect.objectContaining({
        id: 'english',
        label: 'Английский',
        custom: true,
      }),
    );
  });

  it('preserves custom activities and hides only known built-in choices', () => {
    const settings = normalizeSettings({
      customActivityOptions: [{ id: 'custom:activity:swimming', label: 'Плавание', archived: false }],
      hiddenActivityIds: ['walk', 'bachata', 'unknown'],
    });
    const entry = normalizeDailyEntry({
      date: '2026-07-17',
      activities: ['custom:activity:swimming', 'bachata'],
      activitiesRecorded: true,
    });

    expect(settings.customActivityOptions).toContainEqual(
      expect.objectContaining({
        id: 'custom:activity:swimming',
        label: 'Плавание',
        custom: true,
      }),
    );
    expect(settings.hiddenActivityIds).toEqual(['walk']);
    expect(entry.activities).toEqual(['custom:activity:swimming', 'bachata']);
  });

  it('removes the ambiguous factor from new choices without deleting old marks', () => {
    const normalized = normalizeDailyEntry({ date: '2026-07-16', contextFactors: ['other'] });

    expect(contextFactorOptions.some((option) => option.id === 'other')).toBe(false);
    expect(normalized.contextFactors).toEqual(['other']);
    expect(contextFactorLabel('other')).toBe('Другое (старая отметка)');
  });
});
