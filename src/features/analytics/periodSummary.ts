import type { ActionDirectionId, DailyEntry, ResultRecord } from '@/types';
import { actionDirectionOptions, dailyFieldWasRecorded, externalCareerStates, lifeAreaOptions } from '@/types';
import { dataCoverageLevel } from './coverage';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '@/services/dates';

export type PeriodSummary = {
  entriesCount: number;
  ordinaryEntriesCount: number;
  coveredEntriesCount: number;
  ordinaryCoveredEntriesCount: number;
  ordinaryCoreEntriesCount: number;
  sleepSamples: number;
  timeInBedSamples: number;
  energySamples: number;
  sleepQualitySamples: number;
  weightSamples: number;
  nutritionSamples: number;
  actionDirectionSamples: number;
  experimentMarkedDays: number;
  experimentCompletedDays: number;
  sleepTimingSamples: number;
  averageSleep: number | null;
  averageTimeInBed: number | null;
  averageSleepEfficiency: number | null;
  averageEnergy: number | null;
  averageSleepQuality: number | null;
  careerDays: number;
  careerSamples: number;
  externalSteps: number;
  movementDays: number;
  movementSamples: number;
  nutritionSupportDays: number;
  nutritionBlockDays: number;
  averageWeightKg: number | null;
  actionDirectionCounts: Record<ActionDirectionId, number>;
  externalActionDays: number;
  preparationDays: number;
  driftDays: number;
  specialDays: number;
  bedtimeVariationMinutes: number | null;
  wakeTimeVariationMinutes: number | null;
  areaCounts: Record<string, number>;
  lifeAreaSamples: number;
};

export function summarize(entries: DailyEntry[], externalCareerIds: string[] = externalCareerStates): PeriodSummary {
  const ordinaryEntries = entries.filter((entry) => entry.specialDay === null);
  const coveredEntries = entries.filter((entry) => dataCoverageLevel(entry) > 0);
  const ordinaryCoveredEntries = ordinaryEntries.filter((entry) => dataCoverageLevel(entry) > 0);
  const areaCounts = Object.fromEntries(lifeAreaOptions.map(({ id }) => [id, 0])) as Record<string, number>;
  const actionDirectionCounts = Object.fromEntries(actionDirectionOptions.map(({ id }) => [id, 0])) as Record<ActionDirectionId, number>;
  for (const entry of entries) {
    for (const area of entry.lifeAreas) {
      areaCounts[area] = (areaCounts[area] ?? 0) + 1;
    }
    if (entry.actionDirection) {
      actionDirectionCounts[entry.actionDirection] += 1;
    }
  }

  return {
    entriesCount: entries.length,
    ordinaryEntriesCount: ordinaryEntries.length,
    coveredEntriesCount: coveredEntries.length,
    ordinaryCoveredEntriesCount: ordinaryCoveredEntries.length,
    ordinaryCoreEntriesCount: ordinaryEntries.filter((entry) => dataCoverageLevel(entry) === 2).length,
    sleepSamples: sampleCount(ordinaryEntries.map((entry) => entry.sleepMinutes)),
    timeInBedSamples: sampleCount(ordinaryEntries.map((entry) => entry.timeInBedMinutes)),
    energySamples: sampleCount(ordinaryEntries.map((entry) => entry.energy)),
    sleepQualitySamples: sampleCount(ordinaryEntries.map((entry) => entry.sleepQuality)),
    weightSamples: sampleCount(ordinaryEntries.map((entry) => entry.weightKg)),
    nutritionSamples: entries.filter((entry) => entry.nutritionState !== null).length,
    actionDirectionSamples: entries.filter((entry) => dailyFieldWasRecorded(entry, 'actionDirection')).length,
    experimentMarkedDays: entries.filter((entry) => entry.experimentCompleted !== null).length,
    experimentCompletedDays: entries.filter((entry) => entry.experimentCompleted === true).length,
    sleepTimingSamples: ordinaryEntries.filter(
      (entry) => clockMinutes(entry.bedtime, true) !== null && clockMinutes(entry.wakeTime, false) !== null,
    ).length,
    averageSleep: average(ordinaryEntries.map((entry) => entry.sleepMinutes)),
    averageTimeInBed: average(ordinaryEntries.map((entry) => entry.timeInBedMinutes)),
    averageSleepEfficiency: average(ordinaryEntries.map(sleepEfficiency)),
    averageEnergy: average(ordinaryEntries.map((entry) => entry.energy)),
    averageSleepQuality: average(ordinaryEntries.map((entry) => entry.sleepQuality)),
    careerDays: entries.filter((entry) => careerStatesForEntry(entry).length > 0).length,
    careerSamples: entries.filter((entry) => dailyFieldWasRecorded(entry, 'careerStates')).length,
    externalSteps: entries.filter((entry) => careerStatesForEntry(entry).some((state) => externalCareerIds.includes(state))).length,
    movementDays: entries.filter(hasMovement).length,
    movementSamples: entries.filter((entry) => dailyFieldWasRecorded(entry, 'activities')).length,
    nutritionSupportDays: entries.filter((entry) => entry.nutritionState === 'supports_goal').length,
    nutritionBlockDays: entries.filter((entry) => entry.nutritionState === 'blocks_goal').length,
    averageWeightKg: average(ordinaryEntries.map((entry) => entry.weightKg)),
    actionDirectionCounts,
    externalActionDays: actionDirectionCounts.external,
    preparationDays: actionDirectionCounts.preparation,
    driftDays: actionDirectionCounts.drift,
    specialDays: entries.filter((entry) => entry.specialDay !== null).length,
    bedtimeVariationMinutes: clockVariation(ordinaryEntries.map((entry) => clockMinutes(entry.bedtime, true))),
    wakeTimeVariationMinutes: clockVariation(ordinaryEntries.map((entry) => clockMinutes(entry.wakeTime, false))),
    areaCounts,
    lifeAreaSamples: entries.filter((entry) => dailyFieldWasRecorded(entry, 'lifeAreas')).length,
  };
}

export function entriesForWeek(entries: DailyEntry[], anchor: string): DailyEntry[] {
  return entriesForPeriod(entries, startOfWeek(anchor), endOfWeek(anchor));
}

export function entriesForMonth(entries: DailyEntry[], anchor: string): DailyEntry[] {
  return entriesForPeriod(entries, startOfMonth(anchor), endOfMonth(anchor));
}

export function entriesForPeriod(entries: DailyEntry[], start: string, end: string): DailyEntry[] {
  return entries.filter((entry) => entry.date >= start && entry.date <= end);
}

export function resultsForPeriod(results: ResultRecord[], start: string, end: string): ResultRecord[] {
  return results.filter((result) => result.date >= start && result.date <= end).sort((a, b) => b.date.localeCompare(a.date));
}

export function careerStatesForEntry(entry: DailyEntry): string[] {
  if (entry.careerStates.length) {
    return entry.careerStates;
  }
  return entry.careerState ? [entry.careerState] : [];
}

export function hasMovement(entry: DailyEntry): boolean {
  return entry.activities.some((activity) => activity !== 'recovery');
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function sampleCount(values: Array<number | null>): number {
  return values.filter((value) => value !== null).length;
}

function sleepEfficiency(entry: DailyEntry): number | null {
  if (entry.sleepMinutes === null || entry.timeInBedMinutes === null || entry.timeInBedMinutes <= 0) {
    return null;
  }
  return Math.min(100, (entry.sleepMinutes / entry.timeInBedMinutes) * 100);
}

function clockMinutes(value: string, shiftMorning: boolean): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  const total = hours * 60 + minutes;
  return shiftMorning && total < 12 * 60 ? total + 24 * 60 : total;
}

function clockVariation(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length < 2) {
    return null;
  }
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const variance = valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length;
  return Math.round(Math.sqrt(variance));
}
