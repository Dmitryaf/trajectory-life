import type { AppSettings, DailyEntry, Experiment, ExperimentDecision, ExperimentRecord } from '@/types';

export const experimentTextLimits = {
  title: 800,
  hypothesis: 800,
  conclusion: 2000,
  dailyNote: 500,
} as const;

export const experimentDecisionOptions: Array<{ id: ExperimentDecision; label: string; icon: string }> = [
  { id: 'continue', label: 'Продолжить', icon: '→' },
  { id: 'adjust', label: 'Изменить', icon: '⌁' },
  { id: 'stop', label: 'Завершить', icon: '✓' },
  { id: 'more_data', label: 'Собрать ещё данные', icon: '+' },
];

export function emptyExperiment(): Experiment {
  return {
    id: '',
    active: false,
    title: '',
    hypothesis: '',
    targetMetricId: null,
    targetMetric: '',
    targetDirection: 'increase',
    minimumMeaningfulChange: null,
    startDate: '',
    endDate: '',
    conclusion: '',
    decision: null,
  };
}

export function createExperimentId(createdAt = new Date().toISOString()): string {
  return `experiment-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createExperimentRecord(experiment: Experiment, completedAt = new Date().toISOString()): ExperimentRecord {
  const { active: _active, ...snapshot } = experiment;
  return {
    ...snapshot,
    id: experiment.id || createExperimentId(completedAt),
    completedAt,
  };
}

export function linkLegacyExperimentEntries(entries: DailyEntry[], settings: AppSettings): DailyEntry[] {
  const experiments = [settings.experiment, ...settings.experimentHistory].filter(
    (experiment) => experiment.id && experiment.startDate && experiment.endDate,
  );

  return entries.map((entry) => {
    if (entry.experimentId || (entry.experimentCompleted === null && !entry.experimentNote.trim())) {
      return entry;
    }
    const matches = experiments.filter((experiment) => entry.date >= experiment.startDate && entry.date <= experiment.endDate);
    return matches.length === 1 ? { ...entry, experimentId: matches[0]!.id } : entry;
  });
}

export function experimentDecisionLabel(decision: ExperimentDecision | null): string {
  return experimentDecisionOptions.find((option) => option.id === decision)?.label ?? '';
}

export function experimentPeriodsOverlap(
  first: Pick<Experiment, 'startDate' | 'endDate'>,
  second: Pick<Experiment, 'startDate' | 'endDate'>,
): boolean {
  return experimentOverlapsRange(first, second.startDate, second.endDate);
}

export function experimentOverlapsRange(
  experiment: Pick<Experiment, 'startDate' | 'endDate'>,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return Boolean(
    experiment.startDate &&
    experiment.endDate &&
    rangeStart &&
    rangeEnd &&
    rangeStart <= rangeEnd &&
    experiment.startDate <= rangeEnd &&
    rangeStart <= experiment.endDate,
  );
}

export function experimentIntegrityError(settings: AppSettings): string {
  const active = settings.experiment;
  const historyIds = new Set<string>();

  for (const record of settings.experimentHistory) {
    if (historyIds.has(record.id)) {
      return `Повторяющийся id завершённого эксперимента: ${record.id}`;
    }
    historyIds.add(record.id);
    if (record.startDate && record.endDate && record.startDate > record.endDate) {
      return `Дата окончания завершённого эксперимента должна быть не раньше даты начала: ${record.id}`;
    }
  }

  if (active.active && active.startDate && active.endDate && active.startDate > active.endDate) {
    return 'Дата окончания активного эксперимента должна быть не раньше даты начала';
  }
  if (active.active && active.id && historyIds.has(active.id)) {
    return `Активный и завершённый эксперимент используют один id: ${active.id}`;
  }
  if (active.active && settings.experimentHistory.some((record) => experimentPeriodsOverlap(active, record))) {
    return 'Период активного эксперимента пересекается с завершённым экспериментом';
  }
  for (let index = 0; index < settings.experimentHistory.length; index += 1) {
    const current = settings.experimentHistory[index]!;
    if (settings.experimentHistory.slice(index + 1).some((record) => experimentPeriodsOverlap(current, record))) {
      return 'Периоды завершённых экспериментов пересекаются';
    }
  }
  return '';
}

export function experimentEntryLinkError(entries: DailyEntry[], settings: AppSettings): string {
  const experiments = [
    ...(settings.experiment.active && settings.experiment.id ? [settings.experiment] : []),
    ...settings.experimentHistory,
  ];
  const byId = new Map(experiments.map((experiment) => [experiment.id, experiment]));

  for (const entry of entries) {
    if (!entry.experimentId) {
      continue;
    }
    const experiment = byId.get(entry.experimentId);
    if (!experiment) {
      return `Запись ${entry.date} ссылается на неизвестный эксперимент: ${entry.experimentId}`;
    }
    if (entry.date < experiment.startDate || entry.date > experiment.endDate) {
      return `Запись ${entry.date} находится вне периода эксперимента: ${entry.experimentId}`;
    }
  }
  return '';
}

export function validateExperimentTextLengths(experiment: Experiment): string {
  if (experiment.title.length > experimentTextLimits.title) {
    return `Условие эксперимента длиннее ${experimentTextLimits.title} символов. Сократите текст, чтобы сохранить его.`;
  }
  if (experiment.hypothesis.length > experimentTextLimits.hypothesis) {
    return `Вопрос эксперимента длиннее ${experimentTextLimits.hypothesis} символов. Сократите текст, чтобы сохранить его.`;
  }
  if (experiment.conclusion.length > experimentTextLimits.conclusion) {
    return `Итог эксперимента длиннее ${experimentTextLimits.conclusion} символов. Сократите текст, чтобы сохранить его.`;
  }
  return '';
}
