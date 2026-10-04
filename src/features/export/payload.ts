import { buildObservations, factorSummaries } from '@/features/analytics/observations';
import { entriesForPeriod, resultsForPeriod, summarize } from '@/features/analytics/periodSummary';
import { buildExperimentSummary, type ExperimentSummary } from '../analytics/experimentComparison';
import { experimentOverlapsRange } from '../experiments/model';
import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek, todayKey } from '@/services/dates';
import { AI_REPORT_VERSION } from '@/model/dataVersions';
import {
  actionDirectionOptions,
  activityOptions,
  careerOptions,
  contextFactorOptions,
  externalCareerIdsForOptions,
  legacyActivityOptions,
  legacyCareerOptions,
  legacyContextFactorOptions,
  lifeAreaOptions,
  lifeEventTypeOptions,
  nutritionOptions,
  resultAreaOptions,
  specialDayOptions,
  type AppSettings,
  type DailyEntry,
  type ExperimentRecord,
  type LifeEventRecord,
  type MonthlyReview,
  type ResultRecord,
  type WeeklyReview,
} from '@/types';

export type AiReportPeriod = 'week' | 'month' | 'range';
export const AI_PROMPT_CHARACTER_LIMIT = 48_000;

export type AiReportPayload = {
  app: 'trajectory';
  version: number;
  period: AiReportPeriod;
  rangeMonths?: number;
  start: string;
  end: string;
  dataThrough: string;
  generatedAt: string;
  summary: ReturnType<typeof summarize>;
  observations: ReturnType<typeof buildObservations>;
  factorSummaries: ReturnType<typeof factorSummaries>;
  experimentSummary: ExperimentSummary | null;
  experimentHistory: Array<{ record: ExperimentRecord; summary: ExperimentSummary | null }>;
  entries: DailyEntry[];
  results: ResultRecord[];
  lifeEvents: LifeEventRecord[];
  weeklyReview?: WeeklyReview;
  previousWeeklyReview?: WeeklyReview;
  weeklyReviews?: WeeklyReview[];
  monthlyReview?: MonthlyReview;
  previousMonthlyReview?: MonthlyReview;
  monthlyReviews?: MonthlyReview[];
  labels: ReturnType<typeof buildLabelDictionary>;
  settingsSnapshot: {
    activeDailyBlocks: AppSettings['activeDailyBlocks'];
    activeLifeAreas: string[];
    activeFocusTitle: string;
    focusOutcomeCriterion: string;
    focusReviewDate: string;
    externalEvidenceCriterion: string;
    nutritionGoalCriterion: string;
    experiment: AppSettings['experiment'] | null;
  };
};

export type AiReportSourceData = {
  entries: DailyEntry[];
  results: ResultRecord[];
  lifeEvents: LifeEventRecord[];
  reviews: WeeklyReview[];
  monthlyReviews: MonthlyReview[];
  settings: AppSettings;
};

export function buildAiReportPayload(
  period: Exclude<AiReportPeriod, 'range'>,
  anchor: string,
  source: AiReportSourceData,
): AiReportPayload {
  const start = period === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const end = period === 'week' ? endOfWeek(anchor) : endOfMonth(anchor);
  const dataThrough = end < todayKey() ? end : todayKey();
  return buildPayload(period, start, end, dataThrough, source, {
    weeklyReview: period === 'week' ? source.reviews.find((review) => review.weekStart === start) : undefined,
    previousWeeklyReview: period === 'week' ? source.reviews.find((review) => review.weekStart === addDays(start, -7)) : undefined,
    monthlyReview: period === 'month' ? source.monthlyReviews.find((review) => review.monthStart === start) : undefined,
    previousMonthlyReview:
      period === 'month' ? source.monthlyReviews.find((review) => review.monthStart === addMonths(start, -1)) : undefined,
  });
}

export function buildAiReportRangePayload(rangeMonths: number, anchor: string, source: AiReportSourceData): AiReportPayload {
  const start = startOfMonth(addMonths(anchor, -(rangeMonths - 1)));
  const end = anchor < todayKey() ? anchor : todayKey();
  return buildPayload('range', start, end, end, source, {
    rangeMonths,
    monthlyReviews: source.monthlyReviews
      .filter((review) => review.monthStart >= start && review.monthStart <= end)
      .sort((a, b) => a.monthStart.localeCompare(b.monthStart)),
  });
}

export function buildAiReportCustomRangePayload(start: string, end: string, source: AiReportSourceData): AiReportPayload {
  const dataThrough = end < todayKey() ? end : todayKey();
  return buildPayload('range', start, end, dataThrough, source, {
    weeklyReviews: source.reviews
      .filter((review) => addDays(review.weekStart, 6) >= start && review.weekStart <= dataThrough)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    monthlyReviews: source.monthlyReviews
      .filter((review) => endOfMonth(review.monthStart) >= start && review.monthStart <= dataThrough)
      .sort((a, b) => a.monthStart.localeCompare(b.monthStart)),
  });
}

function buildPayload(
  period: AiReportPeriod,
  start: string,
  end: string,
  dataThrough: string,
  source: AiReportSourceData,
  extra: Partial<AiReportPayload>,
): AiReportPayload {
  const entries = dataThrough >= start ? entriesForPeriod(source.entries, start, dataThrough) : [];
  const factorItems = [...contextFactorOptions, ...source.settings.customContextFactorOptions];
  const externalCareerIds = externalCareerIdsForOptions(source.settings.customCareerOptions);
  const activeExperimentOverlaps =
    source.settings.experiment.active && experimentOverlapsRange(source.settings.experiment, start, dataThrough);

  return {
    app: 'trajectory',
    version: AI_REPORT_VERSION,
    period,
    start,
    end,
    dataThrough,
    generatedAt: new Date().toISOString(),
    summary: summarize(entries, externalCareerIds),
    observations: buildObservations(entries, factorItems),
    factorSummaries: factorSummaries(entries, factorItems),
    experimentSummary: activeExperimentOverlaps ? buildExperimentSummary(source.entries, source.settings.experiment) : null,
    experimentHistory: source.settings.experimentHistory
      .filter((record) => experimentOverlapsRange(record, start, dataThrough))
      .map((record) => ({ record: { ...record }, summary: buildExperimentSummary(source.entries, record) })),
    entries,
    results: dataThrough >= start ? resultsForPeriod(source.results, start, dataThrough) : [],
    lifeEvents: source.lifeEvents
      .filter((event) => event.date >= start && event.date <= dataThrough)
      .sort((a, b) => b.date.localeCompare(a.date)),
    labels: buildLabelDictionary(source.settings),
    settingsSnapshot: {
      activeDailyBlocks: source.settings.activeDailyBlocks,
      activeLifeAreas: source.settings.activeLifeAreas,
      activeFocusTitle: source.settings.activeFocusTitle,
      focusOutcomeCriterion: source.settings.focusOutcomeCriterion,
      focusReviewDate: source.settings.focusReviewDate,
      externalEvidenceCriterion: source.settings.externalEvidenceCriterion,
      nutritionGoalCriterion: source.settings.nutritionGoalCriterion,
      experiment: activeExperimentOverlaps ? { ...source.settings.experiment } : null,
    },
    ...extra,
  };
}

function buildLabelDictionary(settings: AppSettings) {
  const copyOptions = <T extends string>(options: Array<{ id: T; label: string; countsAsExternal?: boolean; archived?: boolean }>) =>
    options.map(({ id, label, countsAsExternal, archived }) => ({
      id,
      label,
      ...(countsAsExternal ? { countsAsExternal: true } : {}),
      ...(archived ? { archived: true } : {}),
    }));
  return {
    career: copyOptions([...careerOptions, ...legacyCareerOptions, ...settings.customCareerOptions]),
    lifeAreas: copyOptions([...lifeAreaOptions, ...settings.customLifeAreaOptions]),
    contextFactors: copyOptions([...contextFactorOptions, ...legacyContextFactorOptions, ...settings.customContextFactorOptions]),
    activities: copyOptions([...activityOptions, ...legacyActivityOptions, ...settings.customActivityOptions]),
    actionDirections: copyOptions(actionDirectionOptions),
    nutrition: copyOptions(nutritionOptions),
    specialDays: copyOptions(specialDayOptions),
    eventTypes: copyOptions(lifeEventTypeOptions),
    resultAreas: copyOptions([...resultAreaOptions, ...settings.customLifeAreaOptions]),
  };
}
