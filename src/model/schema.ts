export type BaseCareerState = 'workday' | 'learning' | 'communication' | 'own_project' | 'work_result';
export type CareerState = BaseCareerState | string;
export type BaseActivityId = 'boxing' | 'bachata' | 'walk' | 'workout' | 'recovery';
export type ActivityId = BaseActivityId | string;
export type NutritionState = 'supports_goal' | 'neutral' | 'blocks_goal';
export type ActionDirectionId = 'external' | 'preparation' | 'maintenance' | 'recovery' | 'drift';
export type SpecialDayId = 'sick' | 'travel' | 'overload' | 'event' | 'recovery' | 'other';
export type LifeEventType = 'change' | 'milestone' | 'decision' | 'event' | 'insight' | 'other';
export type BaseContextFactorId =
  | 'late_bedtime'
  | 'screen'
  | 'news'
  | 'series_video'
  | 'porn'
  | 'work_code'
  | 'late_food'
  | 'caffeine_alcohol'
  | 'anxiety_overload'
  | 'other';
export type ContextFactorId = BaseContextFactorId | string;
export type BaseLifeAreaId = 'family' | 'reading' | 'creativity' | 'spiritual' | 'rest' | 'friends' | 'english';
export type LifeAreaId = BaseLifeAreaId | string;
export type DailyBlockId = 'sleep' | 'context' | 'career' | 'movement' | 'nutrition';
export type DailyRecordedFieldId =
  | 'bedtime'
  | 'wakeTime'
  | 'sleepMinutes'
  | 'timeInBedMinutes'
  | 'sleepQuality'
  | 'energy'
  | 'contextFactors'
  | 'contextNote'
  | 'specialDay'
  | 'careerStates'
  | 'activities'
  | 'nutritionState'
  | 'nutritionNote'
  | 'weightKg'
  | 'actionDirection'
  | 'actionNote'
  | 'lifeAreas'
  | 'importantFact'
  | 'experimentCompleted'
  | 'experimentNote';

export { DAILY_ENTRY_SCHEMA_VERSION as currentDailyEntrySchemaVersion } from './dataVersions';
export type ExperimentMetricId = 'sleepMinutes' | 'timeInBedMinutes' | 'sleepQuality' | 'energy' | 'weightKg';
export type ExperimentDirection = 'increase' | 'decrease';
export type ExperimentDecision = 'continue' | 'adjust' | 'stop' | 'more_data';

export type DailyEntry = {
  date: string;
  entrySchemaVersion: number | null;
  activeDailyBlocksSnapshot: DailyBlockId[] | null;
  recordedFields: DailyRecordedFieldId[];
  bedtime: string;
  wakeTime: string;
  sleepMinutes: number | null;
  timeInBedMinutes: number | null;
  sleepQuality: number | null;
  energy: number | null;
  contextFactors: ContextFactorId[];
  contextFactorsRecorded: boolean;
  contextNote: string;
  specialDay: SpecialDayId | null;
  specialDayNote: string;
  careerState: CareerState | null;
  careerStates: CareerState[];
  activities: ActivityId[];
  activitiesRecorded: boolean;
  nutritionState: NutritionState | null;
  nutritionNote: string;
  nutritionCriterion: string;
  weightKg: number | null;
  actionDirection: ActionDirectionId | null;
  actionNote: string;
  focusTitle: string;
  focusOutcomeCriterion: string;
  focusReviewDate: string;
  externalEvidenceCriterion: string;
  lifeAreas: LifeAreaId[];
  lifeAreasRecorded: boolean;
  importantFact: string;
  experimentId: string | null;
  experimentCompleted: boolean | null;
  experimentNote: string;
  updatedAt: string;
};

export type DailyEntryDraft = {
  date: string;
  entry: DailyEntry;
  updatedAt: string;
};

export type ResultRecord = {
  id?: number;
  date: string;
  area: LifeAreaId | 'career' | 'sport' | 'nutrition' | 'sleep' | 'health';
  title: string;
  note: string;
  createdAt: string;
};

export type LifeEventRecord = {
  id?: number;
  date: string;
  type: LifeEventType;
  title: string;
  note: string;
  createdAt: string;
};

export type WeeklyReview = {
  weekStart: string;
  coveredThrough: string;
  updatedAt: string;
  previousPlanOutcome: string;
  results: string[];
  highlights: string[];
  stateContext: string;
  support: string;
  obstacle: string;
  nextLever: string;
  ifThenPlan: string;
};

export type MonthlyReview = {
  monthStart: string;
  updatedAt: string;
  mainPattern: string;
  support: string;
  obstacle: string;
  courseChange: string;
  nextFocus: string;
  ifThenPlan: string;
};

export type Experiment = {
  id: string;
  active: boolean;
  title: string;
  hypothesis: string;
  targetMetricId: ExperimentMetricId | null;
  targetMetric: string;
  targetDirection: ExperimentDirection;
  minimumMeaningfulChange: number | null;
  startDate: string;
  endDate: string;
  conclusion: string;
  decision: ExperimentDecision | null;
};

export type ExperimentRecord = Omit<Experiment, 'active'> & {
  id: string;
  completedAt: string;
};

export type FirstUseStatus = 'not_started' | 'available' | 'in_progress' | 'completed' | 'dismissed';

export type FirstUseStep = 'choice' | 'results' | 'highlights' | 'state_context' | 'support_obstacle' | 'decision' | 'overview';

export type FirstUseState = {
  status: FirstUseStatus;
  weekStart: string;
  periodEnd: string;
  lastStep: FirstUseStep;
  overviewSeen: boolean;
  updatedAt: string;
};

export type AppSettings = {
  id: 'main';
  settingsVersion: number;
  introSeen: boolean;
  aiAnalysisNudgeDismissed: boolean;
  firstUse: FirstUseState;
  activeDailyBlocks: DailyBlockId[];
  activeLifeAreas: LifeAreaId[];
  customActivityOptions: Option<ActivityId>[];
  hiddenActivityIds: ActivityId[];
  customCareerOptions: Option<CareerState>[];
  customLifeAreaOptions: Option<LifeAreaId>[];
  customContextFactorOptions: Option<ContextFactorId>[];
  hiddenContextFactorIds: ContextFactorId[];
  activeFocusTitle: string;
  focusOutcomeCriterion: string;
  focusReviewDate: string;
  externalEvidenceCriterion: string;
  nutritionGoalCriterion: string;
  experiment: Experiment;
  experimentHistory: ExperimentRecord[];
};

export type Option<T extends string = string> = {
  id: T;
  label: string;
  icon?: string;
  custom?: boolean;
  countsAsExternal?: boolean;
  archived?: boolean;
};

export type ExperimentMetricOption = Option<ExperimentMetricId> & {
  unit: string;
  defaultMinimumChange: number;
  step: number;
};
