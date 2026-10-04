import { addDays, dateRange } from '@/services/dates';
import { experimentMetricOptions, type DailyEntry, type ExperimentMetricId } from '@/types';

type ExperimentPeriod = {
  id?: string;
  startDate: string;
  endDate: string;
};

export type ExperimentMetricComparison = {
  id: ExperimentMetricId;
  label: string;
  unit: string;
  baselineAverage: number | null;
  experimentAverage: number | null;
  baselineSamples: number;
  experimentSamples: number;
  difference: number | null;
};

export type ExperimentSummary = {
  baselineStart: string;
  baselineEnd: string;
  experimentStart: string;
  experimentEnd: string;
  plannedDays: number;
  adherenceMarkedDays: number;
  adherenceCompletedDays: number;
  adherenceNotCompletedDays: number;
  adherenceUnmarkedDays: number;
  metrics: ExperimentMetricComparison[];
};

export function buildExperimentSummary(entries: DailyEntry[], experiment: ExperimentPeriod): ExperimentSummary | null {
  if (!experiment.startDate || !experiment.endDate || experiment.startDate > experiment.endDate) {
    return null;
  }

  const plannedDays = dateRange(experiment.startDate, experiment.endDate).length;
  const baselineEnd = addDays(experiment.startDate, -1);
  const baselineStart = addDays(experiment.startDate, -plannedDays);
  const baselineEntries = ordinaryEntriesInRange(entries, baselineStart, baselineEnd);
  const experimentEntries = ordinaryEntriesInRange(entries, experiment.startDate, experiment.endDate);
  const plannedExperimentEntries = experiment.id
    ? entries.filter(
        (entry) => entry.experimentId === experiment.id && entry.date >= experiment.startDate && entry.date <= experiment.endDate,
      )
    : entries.filter((entry) => entry.date >= experiment.startDate && entry.date <= experiment.endDate);
  const markedDays = plannedExperimentEntries.filter((entry) => entry.experimentCompleted !== null);

  return {
    baselineStart,
    baselineEnd,
    experimentStart: experiment.startDate,
    experimentEnd: experiment.endDate,
    plannedDays,
    adherenceMarkedDays: markedDays.length,
    adherenceCompletedDays: markedDays.filter((entry) => entry.experimentCompleted === true).length,
    adherenceNotCompletedDays: markedDays.filter((entry) => entry.experimentCompleted === false).length,
    adherenceUnmarkedDays: Math.max(0, plannedDays - markedDays.length),
    metrics: experimentMetricOptions.flatMap((metric) => {
      const baselineValues = metricValues(baselineEntries, metric.id);
      const experimentValues = metricValues(experimentEntries, metric.id);
      if (!baselineValues.length && !experimentValues.length) {
        return [];
      }
      const baselineAverage = average(baselineValues);
      const experimentAverage = average(experimentValues);
      return [
        {
          id: metric.id,
          label: metric.label,
          unit: metric.unit,
          baselineAverage,
          experimentAverage,
          baselineSamples: baselineValues.length,
          experimentSamples: experimentValues.length,
          difference: baselineAverage === null || experimentAverage === null ? null : experimentAverage - baselineAverage,
        },
      ];
    }),
  };
}

function ordinaryEntriesInRange(entries: DailyEntry[], start: string, end: string): DailyEntry[] {
  return entries.filter((entry) => entry.date >= start && entry.date <= end && entry.specialDay === null);
}

function metricValues(entries: DailyEntry[], metricId: ExperimentMetricId): number[] {
  return entries.map((entry) => entry[metricId]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
