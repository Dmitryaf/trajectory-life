import { activityOptions, contextFactorOptions, dailyBlockOptions, experimentMetricOptions, legacyLifeAreaOptions } from './options';
import { removedDemoCareerOptionId, removedDemoContextFactorId, validDate } from './normalization';
import { SETTINGS_VERSION } from './dataVersions';
import type {
  ActivityId,
  AppSettings,
  ContextFactorId,
  DailyBlockId,
  Experiment,
  ExperimentDecision,
  ExperimentMetricId,
  ExperimentRecord,
  FirstUseState,
  FirstUseStatus,
  FirstUseStep,
  LifeAreaId,
  Option,
} from './schema';

export const defaultSettings: AppSettings = {
  id: 'main',
  settingsVersion: SETTINGS_VERSION,
  introSeen: false,
  aiAnalysisNudgeDismissed: false,
  firstUse: {
    status: 'not_started',
    weekStart: '',
    periodEnd: '',
    lastStep: 'choice',
    overviewSeen: false,
    updatedAt: '',
  },
  activeDailyBlocks: dailyBlockOptions.filter((option) => option.id !== 'career').map((option) => option.id),
  activeLifeAreas: ['family', 'reading', 'creativity', 'rest'],
  customActivityOptions: [],
  hiddenActivityIds: [],
  customCareerOptions: [],
  customLifeAreaOptions: [],
  customContextFactorOptions: [],
  hiddenContextFactorIds: [],
  activeFocusTitle: '',
  focusOutcomeCriterion: '',
  focusReviewDate: '',
  externalEvidenceCriterion: '',
  nutritionGoalCriterion: '',
  experiment: {
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
  },
  experimentHistory: [],
};

type LegacyAppSettings = Omit<Partial<AppSettings>, 'firstUse'> & {
  firstUse?: Partial<FirstUseState>;
  customEveningFactorOptions?: unknown;
};

export function normalizeSettings(settings: LegacyAppSettings | null | undefined): AppSettings {
  const source = settings ?? {};
  const customActivityOptions = sanitizeOptions(source.customActivityOptions).filter(
    (option) => !activityOptions.some((builtIn) => builtIn.id === option.id),
  );
  const hiddenActivityIds = Array.isArray(source.hiddenActivityIds)
    ? Array.from(
        new Set(
          source.hiddenActivityIds.filter(
            (id): id is ActivityId => typeof id === 'string' && activityOptions.some((option) => option.id === id),
          ),
        ),
      )
    : [];
  const customCareerOptions = sanitizeOptions(source.customCareerOptions).filter((option) => option.id !== removedDemoCareerOptionId);
  const activeLifeAreas = Array.isArray(source.activeLifeAreas)
    ? source.activeLifeAreas.filter((area): area is LifeAreaId => typeof area === 'string')
    : defaultSettings.activeLifeAreas;
  const customLifeAreaOptions = sanitizeOptions(source.customLifeAreaOptions);
  for (const option of legacyLifeAreaOptions) {
    if (activeLifeAreas.includes(option.id) && !customLifeAreaOptions.some((item) => item.id === option.id)) {
      customLifeAreaOptions.push({ ...option, custom: true });
    }
  }
  const customContextFactorOptions = sanitizeOptions(source.customContextFactorOptions ?? source.customEveningFactorOptions).filter(
    (option) => option.id !== removedDemoContextFactorId,
  );
  const hiddenContextFactorIds = Array.isArray(source.hiddenContextFactorIds)
    ? Array.from(
        new Set(
          source.hiddenContextFactorIds.filter(
            (id): id is ContextFactorId => typeof id === 'string' && contextFactorOptions.some((option) => option.id === id),
          ),
        ),
      )
    : [];

  let parsedDailyBlocks: DailyBlockId[];
  if (Array.isArray(source.activeDailyBlocks)) {
    parsedDailyBlocks = source.activeDailyBlocks.filter((block): block is DailyBlockId =>
      dailyBlockOptions.some((option) => option.id === block),
    );
  } else if (settings == null) {
    parsedDailyBlocks = defaultSettings.activeDailyBlocks;
  } else {
    parsedDailyBlocks = dailyBlockOptions.map((option) => option.id);
  }
  const activeDailyBlocks =
    (source.settingsVersion ?? 1) < 5 && !parsedDailyBlocks.includes('context')
      ? [...parsedDailyBlocks, 'context' as const]
      : parsedDailyBlocks;

  return {
    ...structuredClone(defaultSettings),
    id: 'main',
    settingsVersion: defaultSettings.settingsVersion,
    introSeen: source.introSeen === true,
    aiAnalysisNudgeDismissed: source.aiAnalysisNudgeDismissed === true,
    firstUse: normalizeFirstUseState(source.firstUse, settings == null),
    activeDailyBlocks,
    activeLifeAreas: (source.settingsVersion ?? 1) < 2 ? activeLifeAreas.filter((area) => area !== 'spiritual') : activeLifeAreas,
    customActivityOptions,
    hiddenActivityIds,
    customCareerOptions,
    customLifeAreaOptions,
    customContextFactorOptions,
    hiddenContextFactorIds,
    activeFocusTitle: typeof source.activeFocusTitle === 'string' ? source.activeFocusTitle : '',
    focusOutcomeCriterion: typeof source.focusOutcomeCriterion === 'string' ? source.focusOutcomeCriterion : '',
    focusReviewDate: validDate(source.focusReviewDate),
    externalEvidenceCriterion: typeof source.externalEvidenceCriterion === 'string' ? source.externalEvidenceCriterion : '',
    nutritionGoalCriterion: typeof source.nutritionGoalCriterion === 'string' ? source.nutritionGoalCriterion : '',
    experiment: normalizeExperiment(source.experiment),
    experimentHistory: normalizeExperimentHistory(source.experimentHistory),
  };
}

function normalizeFirstUseState(value: unknown, isNewInstall: boolean): FirstUseState {
  const fallback: FirstUseState = {
    ...structuredClone(defaultSettings.firstUse),
    status: isNewInstall ? 'not_started' : 'available',
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const source = value as Partial<FirstUseState>;
  const status = isFirstUseStatus(source.status) ? source.status : fallback.status;
  const weekStart = validDate(source.weekStart);
  if ((status === 'in_progress' || status === 'completed') && !weekStart) {
    return fallback;
  }
  const hasRecoveryWeek = status === 'in_progress' || status === 'completed';
  const periodEnd = validRecoveryPeriodEnd(source.periodEnd, weekStart);

  return {
    status,
    weekStart: hasRecoveryWeek ? weekStart : '',
    periodEnd: hasRecoveryWeek ? periodEnd || recoveryWeekEnd(weekStart) : '',
    lastStep: hasRecoveryWeek && isFirstUseStep(source.lastStep) ? source.lastStep : 'choice',
    overviewSeen: status === 'completed' || source.overviewSeen === true,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

function validRecoveryPeriodEnd(value: unknown, weekStart: string): string {
  const periodEnd = validDate(value);
  if (!periodEnd || !weekStart) {
    return '';
  }
  return periodEnd >= weekStart && periodEnd <= recoveryWeekEnd(weekStart) ? periodEnd : '';
}

function recoveryWeekEnd(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function isFirstUseStatus(value: unknown): value is FirstUseStatus {
  return value === 'not_started' || value === 'available' || value === 'in_progress' || value === 'completed' || value === 'dismissed';
}

function isFirstUseStep(value: unknown): value is FirstUseStep {
  return (
    value === 'choice' ||
    value === 'results' ||
    value === 'highlights' ||
    value === 'state_context' ||
    value === 'support_obstacle' ||
    value === 'decision' ||
    value === 'overview'
  );
}

function objectValue<T extends object>(value: unknown): Partial<T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<T>) : {};
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeExperiment(value: unknown): Experiment {
  const source = objectValue<Experiment>(value);
  const active = source.active === true;
  const title = stringOrEmpty(source.title);
  const startDate = validDate(source.startDate);
  const endDate = validDate(source.endDate);
  const targetMetric = stringOrEmpty(source.targetMetric);
  const targetMetricId = isExperimentMetricId(source.targetMetricId) ? source.targetMetricId : legacyExperimentMetricId(targetMetric);
  const metricOption = experimentMetricOptions.find((option) => option.id === targetMetricId);
  let id = '';
  if (typeof source.id === 'string' && source.id.trim()) {
    id = source.id.trim();
  } else if (active && title.trim() && startDate && endDate) {
    id = `legacy-active-${startDate}-${endDate}`;
  }
  let minimumMeaningfulChange: number | null = null;
  if (
    typeof source.minimumMeaningfulChange === 'number' &&
    Number.isFinite(source.minimumMeaningfulChange) &&
    source.minimumMeaningfulChange > 0
  ) {
    minimumMeaningfulChange = source.minimumMeaningfulChange;
  } else if (targetMetricId) {
    minimumMeaningfulChange = metricOption?.defaultMinimumChange ?? null;
  }
  return {
    id,
    active,
    title,
    hypothesis: stringOrEmpty(source.hypothesis),
    targetMetricId,
    targetMetric: metricOption?.label ?? targetMetric,
    targetDirection: source.targetDirection === 'decrease' ? 'decrease' : 'increase',
    minimumMeaningfulChange,
    startDate,
    endDate,
    conclusion: stringOrEmpty(source.conclusion),
    decision: isExperimentDecision(source.decision) ? source.decision : null,
  };
}

function normalizeExperimentHistory(value: unknown): ExperimentRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const source = item as Partial<ExperimentRecord>;
    const experiment = normalizeExperiment(source);
    if (!experiment.title.trim() || !experiment.startDate || !experiment.endDate || experiment.startDate > experiment.endDate) {
      return [];
    }
    const id = typeof source.id === 'string' && source.id.trim() ? source.id : `legacy-experiment-${index}-${experiment.startDate}`;
    if (seen.has(id)) {
      return [];
    }
    seen.add(id);
    const { active: _active, ...snapshot } = experiment;
    return [
      {
        ...snapshot,
        id,
        completedAt: typeof source.completedAt === 'string' ? source.completedAt : '',
      },
    ];
  });
}

function isExperimentDecision(value: unknown): value is ExperimentDecision {
  return value === 'continue' || value === 'adjust' || value === 'stop' || value === 'more_data';
}

function isExperimentMetricId(value: unknown): value is ExperimentMetricId {
  return typeof value === 'string' && experimentMetricOptions.some((option) => option.id === value);
}

function legacyExperimentMetricId(value: string): ExperimentMetricId | null {
  const normalized = value.trim().toLocaleLowerCase('ru-RU');
  const exactLabels: Record<string, ExperimentMetricId> = {
    'продолжительность сна': 'sleepMinutes',
    сон: 'sleepMinutes',
    'время в кровати': 'timeInBedMinutes',
    'качество сна': 'sleepQuality',
    энергия: 'energy',
    'энергия за день': 'energy',
    вес: 'weightKg',
  };
  return exactLabels[normalized] ?? null;
}

export function createCustomOption(label: string, prefix: 'activity' | 'career' | 'life' | 'context'): Option<string> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { id: `custom:${prefix}:${suffix}`, label: label.trim(), icon: '+', custom: true };
}

export function experimentAppliesToDate(experiment: Experiment, date: string): boolean {
  return (
    experiment.active && (!experiment.startDate || date >= experiment.startDate) && (!experiment.endDate || date <= experiment.endDate)
  );
}

function sanitizeOptions(options: unknown): Option<string>[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .filter((option): option is Option<string> => Boolean(option) && typeof option.id === 'string' && typeof option.label === 'string')
    .map((option) => ({
      id: option.id,
      label: option.label,
      icon: typeof option.icon === 'string' ? option.icon : '+',
      custom: true,
      countsAsExternal: Boolean(option.countsAsExternal),
      archived: Boolean(option.archived),
    }));
}
