import { dateRange, formatDate, startOfWeek, todayKey } from '@/services/dates';
import type { DailyEntry, Experiment, ExperimentDecision, ExperimentRecord } from '@/types';
import { experimentOverlapsRange } from './model';
import { experimentWeekStatusLabel, truncateExperimentText } from './presentation';

export type WeeklyExperimentCard = {
  id: string;
  active: boolean;
  title: string;
  titlePreview: string;
  hypothesis: string;
  conclusion: string;
  decision: ExperimentDecision | null;
  statusLabel: string;
  periodLabel: string;
  plannedDays: number;
  completedDays: number;
  notCompletedDays: number;
  unmarkedDays: number;
  totalPlannedDays: number;
  totalCompletedDays: number;
  totalNotCompletedDays: number;
  totalUnmarkedDays: number;
  notes: DailyEntry[];
};

type WeeklyExperimentCardsInput = {
  start: string;
  end: string;
  weekEntries: DailyEntry[];
  allEntries: DailyEntry[];
  activeExperiment: Experiment;
  experimentHistory: ExperimentRecord[];
  currentDate?: string;
};

export function buildWeeklyExperimentCards({
  start,
  end,
  weekEntries,
  allEntries,
  activeExperiment,
  experimentHistory,
  currentDate = todayKey(),
}: WeeklyExperimentCardsInput): WeeklyExperimentCard[] {
  const candidates: Array<{ id: string; experiment: Experiment | ExperimentRecord; active: boolean }> = [];
  if (activeExperiment.active && experimentOverlapsRange(activeExperiment, start, end)) {
    candidates.push({ id: 'active-experiment', experiment: activeExperiment, active: true });
  }
  candidates.push(
    ...experimentHistory
      .filter((experiment) => experimentOverlapsRange(experiment, start, end))
      .map((experiment) => ({ id: experiment.id, experiment, active: false })),
  );

  return candidates.map(({ id, experiment, active }) => {
    const experimentDays = dateRange(start, end).filter((day) => day >= experiment.startDate && day <= experiment.endDate);
    const experimentEntries = weekEntries.filter((entry) => entry.experimentId === experiment.id);
    const marked = experimentEntries.filter((entry) => entry.experimentCompleted !== null);
    const totalDays = dateRange(experiment.startDate, experiment.endDate);
    const totalEntries = allEntries.filter((entry) => entry.experimentId === experiment.id);
    const totalMarked = totalEntries.filter((entry) => entry.experimentCompleted !== null);

    return {
      id,
      active,
      title: experiment.title,
      titlePreview: truncateExperimentText(experiment.title, 180),
      hypothesis: experiment.hypothesis,
      conclusion: experiment.conclusion,
      decision: experiment.decision,
      statusLabel: experimentWeekStatusLabel(
        active,
        start === startOfWeek(currentDate),
        end < startOfWeek(currentDate),
        formatDate(experiment.endDate, { weekday: 'short', day: 'numeric' }),
      ),
      periodLabel: `${formatDate(experiment.startDate, { day: 'numeric', month: 'short' })} — ${formatDate(experiment.endDate, {
        day: 'numeric',
        month: 'short',
      })}`,
      plannedDays: experimentDays.length,
      completedDays: marked.filter((entry) => entry.experimentCompleted === true).length,
      notCompletedDays: marked.filter((entry) => entry.experimentCompleted === false).length,
      unmarkedDays: Math.max(0, experimentDays.length - marked.length),
      totalPlannedDays: totalDays.length,
      totalCompletedDays: totalMarked.filter((entry) => entry.experimentCompleted === true).length,
      totalNotCompletedDays: totalMarked.filter((entry) => entry.experimentCompleted === false).length,
      totalUnmarkedDays: Math.max(0, totalDays.length - totalMarked.length),
      notes: experimentEntries.filter((entry) => entry.experimentNote.trim()),
    };
  });
}
