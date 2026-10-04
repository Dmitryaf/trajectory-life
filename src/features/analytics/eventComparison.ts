import type { DailyEntry, ResultRecord } from '@/types';
import { externalCareerStates } from '@/types';
import { addDays, dateRange, todayKey } from '@/services/dates';
import { entriesForPeriod, resultsForPeriod, summarize } from './periodSummary';

export type EventComparisonMetric = {
  id: 'sleep' | 'energy' | 'weight' | 'external' | 'nutrition' | 'results';
  label: string;
  format: 'minutes' | 'number' | 'weight' | 'percent' | 'count';
  before: number | null;
  after: number | null;
  beforeSamples: number | null;
  afterSamples: number | null;
};

export type EventComparison = {
  windowDays: number;
  beforeStart: string;
  beforeEnd: string;
  afterStart: string;
  afterEnd: string;
  beforeEntries: number;
  afterEntries: number;
  metrics: EventComparisonMetric[];
};

export function buildEventComparison(
  eventDate: string,
  entries: DailyEntry[],
  results: ResultRecord[] = [],
  externalCareerIds: string[] = externalCareerStates,
  requestedWindowDays = 14,
  observationEnd = todayKey(),
): EventComparison | null {
  if (observationEnd <= eventDate) {
    return null;
  }
  const availableAfterDays = dateRange(addDays(eventDate, 1), observationEnd).length;
  const windowDays = Math.min(Math.max(1, requestedWindowDays), availableAfterDays);
  const beforeStart = addDays(eventDate, -windowDays);
  const beforeEnd = addDays(eventDate, -1);
  const afterStart = addDays(eventDate, 1);
  const afterEnd = addDays(eventDate, windowDays);
  const before = entriesForPeriod(entries, beforeStart, beforeEnd);
  const after = entriesForPeriod(entries, afterStart, afterEnd);
  const beforeSummary = summarize(before, externalCareerIds);
  const afterSummary = summarize(after, externalCareerIds);
  const beforeResults = resultsForPeriod(results, beforeStart, beforeEnd).length;
  const afterResults = resultsForPeriod(results, afterStart, afterEnd).length;

  return {
    windowDays,
    beforeStart,
    beforeEnd,
    afterStart,
    afterEnd,
    beforeEntries: beforeSummary.coveredEntriesCount,
    afterEntries: afterSummary.coveredEntriesCount,
    metrics: [
      comparisonMetric(
        'sleep',
        'Сон',
        'minutes',
        beforeSummary.averageSleep,
        afterSummary.averageSleep,
        beforeSummary.sleepSamples,
        afterSummary.sleepSamples,
      ),
      comparisonMetric(
        'energy',
        'Энергия',
        'number',
        beforeSummary.averageEnergy,
        afterSummary.averageEnergy,
        beforeSummary.energySamples,
        afterSummary.energySamples,
      ),
      comparisonMetric(
        'weight',
        'Вес',
        'weight',
        beforeSummary.averageWeightKg,
        afterSummary.averageWeightKg,
        beforeSummary.weightSamples,
        afterSummary.weightSamples,
      ),
      comparisonMetric(
        'external',
        'Шаги к цели',
        'percent',
        ratioPercent(beforeSummary.externalActionDays, beforeSummary.actionDirectionSamples),
        ratioPercent(afterSummary.externalActionDays, afterSummary.actionDirectionSamples),
        beforeSummary.actionDirectionSamples,
        afterSummary.actionDirectionSamples,
      ),
      comparisonMetric(
        'nutrition',
        'Питание поддержало цель',
        'percent',
        ratioPercent(beforeSummary.nutritionSupportDays, beforeSummary.nutritionSamples),
        ratioPercent(afterSummary.nutritionSupportDays, afterSummary.nutritionSamples),
        beforeSummary.nutritionSamples,
        afterSummary.nutritionSamples,
      ),
      comparisonMetric('results', 'Итоги', 'count', beforeResults, afterResults, null, null),
    ],
  };
}

function comparisonMetric(
  id: EventComparisonMetric['id'],
  label: string,
  format: EventComparisonMetric['format'],
  before: number | null,
  after: number | null,
  beforeSamples: number | null,
  afterSamples: number | null,
): EventComparisonMetric {
  return { id, label, format, before, after, beforeSamples, afterSamples };
}

function ratioPercent(value: number, total: number): number | null {
  return total > 0 ? Math.round((value / total) * 100) : null;
}
