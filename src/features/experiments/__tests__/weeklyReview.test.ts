import { describe, expect, it } from 'vitest';
import { defaultSettings, emptyDailyEntry, type ExperimentRecord } from '@/types';
import { buildWeeklyExperimentCards } from '../weeklyReview';

describe('buildWeeklyExperimentCards', () => {
  it('keeps weekly adherence separate from the totals for a cross-week experiment', () => {
    const activeExperiment = {
      ...structuredClone(defaultSettings.experiment),
      id: 'cross-week',
      active: true,
      title: 'Начинать важное действие сразу',
      startDate: '2026-07-16',
      endDate: '2026-07-27',
    };
    const allEntries = [
      { ...emptyDailyEntry('2026-07-17'), experimentId: 'cross-week', experimentCompleted: false },
      {
        ...emptyDailyEntry('2026-07-21'),
        experimentId: 'cross-week',
        experimentCompleted: true,
        experimentNote: 'Подготовил задачу заранее',
      },
      { ...emptyDailyEntry('2026-07-22'), experimentId: 'cross-week', experimentCompleted: null },
    ];

    const cards = buildWeeklyExperimentCards({
      start: '2026-07-20',
      end: '2026-07-26',
      weekEntries: allEntries.filter((entry) => entry.date >= '2026-07-20'),
      allEntries,
      activeExperiment,
      experimentHistory: [],
      currentDate: '2026-07-22',
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'active-experiment',
      active: true,
      statusLabel: 'Идёт сейчас',
      plannedDays: 7,
      completedDays: 1,
      notCompletedDays: 0,
      unmarkedDays: 6,
      totalPlannedDays: 12,
      totalCompletedDays: 1,
      totalNotCompletedDays: 1,
      totalUnmarkedDays: 10,
    });
    expect(cards[0]!.notes.map((entry) => entry.date)).toEqual(['2026-07-21']);
  });

  it('includes only completed experiments that overlap the selected week', () => {
    const completed = (id: string, startDate: string, endDate: string): ExperimentRecord => {
      const { active: _active, ...experiment } = structuredClone(defaultSettings.experiment);
      return {
        ...experiment,
        id,
        title: id,
        startDate,
        endDate,
        completedAt: `${endDate}T18:00:00.000Z`,
      };
    };

    const cards = buildWeeklyExperimentCards({
      start: '2026-07-20',
      end: '2026-07-26',
      weekEntries: [],
      allEntries: [],
      activeExperiment: structuredClone(defaultSettings.experiment),
      experimentHistory: [completed('overlap', '2026-07-19', '2026-07-20'), completed('outside', '2026-07-01', '2026-07-05')],
      currentDate: '2026-07-30',
    });

    expect(cards.map((card) => card.id)).toEqual(['overlap']);
    expect(cards[0]).toMatchObject({ active: false, statusLabel: 'Завершён · пн, 20', plannedDays: 1, unmarkedDays: 1 });
  });
});
