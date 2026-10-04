import { currentDailyEntrySchemaVersion, type DailyBlockId, type DailyEntry } from '@/types';
import { plainCopy } from '@/services/plain';
import { experimentTextLimits } from '../experiments/model';

export type DailyEntryMetrics = {
  sleepMinutes: number | null;
  timeInBedMinutes: number | null;
  weightKg: number | string | null;
};

export type DailyEntryDefaults = {
  focusTitle: string;
  focusOutcomeCriterion: string;
  focusReviewDate: string;
  externalEvidenceCriterion: string;
  nutritionCriterion: string;
  experimentId: string | null;
  activeDailyBlocks: DailyBlockId[];
};

export function timeBetween(start: string, end: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return null;
  }
  const [startHours, startMinutes] = start.split(':').map(Number);
  const [endHours, endMinutes] = end.split(':').map(Number);
  if (startHours > 23 || endHours > 23 || startMinutes > 59 || endMinutes > 59) {
    return null;
  }
  let duration = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  if (duration <= 0) {
    duration += 24 * 60;
  }
  return duration <= 18 * 60 ? duration : null;
}

export function normalizeWeight(value: unknown): number | null {
  let numericValue = Number.NaN;
  if (typeof value === 'number') {
    numericValue = value;
  } else if (typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())) {
    numericValue = Number(value.trim().replace(',', '.'));
  }
  return Number.isFinite(numericValue) ? Math.round(numericValue * 10) / 10 : null;
}

function weightSnapshotValue(value: DailyEntryMetrics['weightKg']): number | string | null {
  const normalized = normalizeWeight(value);
  if (normalized !== null) {
    return normalized;
  }
  return typeof value === 'string' && value.trim() ? `invalid:${value.trim()}` : null;
}

export function snapshotDailyEntry(entry: DailyEntry, metrics: DailyEntryMetrics): string {
  return JSON.stringify({
    ...plainCopy(entry),
    ...metrics,
    weightKg: weightSnapshotValue(metrics.weightKg),
    updatedAt: '',
  });
}

export function prepareDailyEntryForSave(
  entry: DailyEntry,
  metrics: DailyEntryMetrics,
  defaults: DailyEntryDefaults,
  isNew: boolean,
): DailyEntry {
  const prepared = plainCopy(entry);
  prepared.sleepMinutes = metrics.sleepMinutes;
  prepared.timeInBedMinutes = metrics.timeInBedMinutes;
  prepared.weightKg = normalizeWeight(metrics.weightKg);
  if (isNew) {
    prepared.entrySchemaVersion = currentDailyEntrySchemaVersion;
    prepared.activeDailyBlocksSnapshot = [...defaults.activeDailyBlocks];
    if (!prepared.focusTitle.trim()) {
      prepared.focusTitle = defaults.focusTitle.trim();
    }
    if (!prepared.focusOutcomeCriterion.trim()) {
      prepared.focusOutcomeCriterion = defaults.focusOutcomeCriterion.trim();
    }
    if (!prepared.focusReviewDate) {
      prepared.focusReviewDate = defaults.focusReviewDate;
    }
    if (!prepared.externalEvidenceCriterion.trim()) {
      prepared.externalEvidenceCriterion = defaults.externalEvidenceCriterion.trim();
    }
    if (!prepared.nutritionCriterion.trim()) {
      prepared.nutritionCriterion = defaults.nutritionCriterion.trim();
    }
  }
  if (!prepared.experimentId && defaults.experimentId) {
    prepared.experimentId = defaults.experimentId;
  }
  return prepared;
}

export function validateDailyEntryMetrics(metrics: DailyEntryMetrics, sleepBlockActive: boolean): string {
  const normalizedWeight = normalizeWeight(metrics.weightKg);
  if (typeof metrics.weightKg === 'string' && metrics.weightKg.trim() && normalizedWeight === null) {
    return 'Введите вес числом, например 88,2.';
  }
  if (normalizedWeight !== null && (normalizedWeight < 30 || normalizedWeight > 250)) {
    return 'Укажите вес от 30 до 250 кг.';
  }
  if (
    sleepBlockActive &&
    metrics.sleepMinutes !== null &&
    metrics.timeInBedMinutes !== null &&
    metrics.sleepMinutes > metrics.timeInBedMinutes
  ) {
    return 'Время сна не может быть больше времени в кровати.';
  }
  return '';
}

export function validateDailyEntryText(entry: DailyEntry): string {
  if (entry.experimentNote.length > experimentTextLimits.dailyNote) {
    return `Заметка к эксперименту длиннее ${experimentTextLimits.dailyNote} символов. Сократите текст, чтобы сохранить день.`;
  }
  return '';
}
