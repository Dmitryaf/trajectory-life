import { dailyFieldWasRecorded, type DailyEntry } from '@/types';
import { dateRange } from '@/services/dates';

export type DataCoverageLevel = 0 | 1 | 2;

function entryCareerStates(entry: DailyEntry): string[] {
  let careerStates = entry.careerStates;
  if (!careerStates.length && entry.careerState) {
    careerStates = [entry.careerState];
  }
  return careerStates;
}

function hasStateCoverage(entry: DailyEntry): boolean {
  return (
    entry.sleepMinutes !== null ||
    entry.timeInBedMinutes !== null ||
    entry.energy !== null ||
    entry.sleepQuality !== null ||
    entry.bedtime.length > 0 ||
    entry.wakeTime.length > 0
  );
}

function hasActionCoverage(entry: DailyEntry): boolean {
  return (
    entry.actionDirection !== null ||
    entryCareerStates(entry).length > 0 ||
    dailyFieldWasRecorded(entry, 'actionDirection') ||
    dailyFieldWasRecorded(entry, 'careerStates') ||
    dailyFieldWasRecorded(entry, 'activities') ||
    dailyFieldWasRecorded(entry, 'lifeAreas') ||
    entry.importantFact.trim().length > 0
  );
}

function hasNutritionCoverage(entry: DailyEntry): boolean {
  return entry.nutritionState !== null || entry.weightKg !== null || entry.nutritionNote.trim().length > 0;
}

function hasAdditionalCoverage(entry: DailyEntry): boolean {
  const hasContext = entry.specialDay !== null || dailyFieldWasRecorded(entry, 'contextFactors') || entry.contextNote.trim().length > 0;
  const hasExperiment = entry.experimentCompleted !== null || entry.experimentNote.trim().length > 0;
  return hasContext || hasExperiment;
}

export function dataCoverageLevel(entry: DailyEntry): DataCoverageLevel {
  const coreDomains = [hasStateCoverage(entry), hasActionCoverage(entry), hasNutritionCoverage(entry)].filter(Boolean).length;
  if (coreDomains >= 2) {
    return 2;
  }
  return coreDomains === 1 || hasAdditionalCoverage(entry) ? 1 : 0;
}

export function buildCoverageSeries(entries: DailyEntry[], start: string, end: string): Array<[string, DataCoverageLevel]> {
  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));
  return dateRange(start, end).map((date) => {
    const entry = entriesByDate.get(date);
    return [date, entry ? dataCoverageLevel(entry) : 0];
  });
}
