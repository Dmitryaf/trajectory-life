import { computed, ref, watch } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import { buildEventComparison, type EventComparisonMetric } from './eventComparison';
import { entriesForPeriod, resultsForPeriod, summarize } from './periodSummary';
import { buildRangeReviewCues } from './reviewCues';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  formatDate,
  formatMinutes,
  monthsBetween,
  startOfMonth,
  toDateKey,
  todayKey,
} from '@/services/dates';
import { buildRangePackage, copyAiPrompt as copyPackagePrompt, downloadAiPackage } from '../export/browser';
import { buildExperimentSummary } from './experimentComparison';
import { experimentDecisionLabel } from '../experiments/model';
import { notifyInfo, notifySaved, notifyUnknownError } from '@/services/notifications';
import { pageCount, pageItems } from '@/services/pagination';
import { useAppStore } from '@/stores/app';
import { contextFactorOptions, externalCareerIdsForOptions, type ExperimentRecord } from '@/types';
import { chartColors, chartStyles } from '@/shared/theme/colors';

export type RangeMonths = 3 | 6 | 12;
type TrendMetricId = 'sleep' | 'energy' | 'weight';
export type TimelineTone = 'event' | 'result' | 'decision' | 'outcome' | 'experiment';
type DecisionTimelineItem = {
  key: string;
  date: string;
  type: string;
  tone: TimelineTone;
  title: string;
  detail: string;
};

const timelinePageSize = 10;

export function useChangeHistoryView() {
  const store = useAppStore();
  const range = ref<RangeMonths>(3);
  const timelinePage = ref(1);
  const selectedEventKey = ref('');
  const selectedTrendMetric = ref<TrendMetricId>('sleep');
  const rangeOptions: Array<{ value: RangeMonths; label: string }> = [
    { value: 3, label: '3 месяца' },
    { value: 6, label: '6 месяцев' },
    { value: 12, label: '12 месяцев' },
  ];

  const externalCareerIds = computed(() => externalCareerIdsForOptions(store.settings.customCareerOptions));
  const end = computed(() => todayKey());
  const start = computed(() => startOfMonth(addMonths(todayKey(), -(range.value - 1))));
  const entries = computed(() => entriesForPeriod(store.dailyEntries, start.value, end.value));
  const results = computed(() => resultsForPeriod(store.results, start.value, end.value));
  const lifeEvents = computed(() =>
    store.lifeEvents.filter((event) => event.date >= start.value && event.date <= end.value).sort((a, b) => b.date.localeCompare(a.date)),
  );
  const summary = computed(() => summarize(entries.value, externalCareerIds.value));
  const contextFactorItems = computed(() => [...contextFactorOptions, ...store.settings.customContextFactorOptions]);
  const cues = computed(() =>
    buildRangeReviewCues(range.value, entries.value, results.value, lifeEvents.value, externalCareerIds.value, contextFactorItems.value),
  );
  const primaryCues = computed(() => cues.value.slice(0, 3));

  const monthRows = computed(() =>
    monthsBetween(start.value, end.value).map((monthStart) => {
      const monthEnd = monthStart === startOfMonth(todayKey()) ? todayKey() : endOfMonth(monthStart);
      return {
        monthStart,
        label: `${formatDate(monthStart, { month: 'short' })}${monthStart === startOfMonth(todayKey()) ? '*' : ''}`,
        summary: summarize(entriesForPeriod(entries.value, monthStart, monthEnd), externalCareerIds.value),
      };
    }),
  );

  const trendMetricOptions = computed(() => {
    const definitions = [
      {
        id: 'sleep' as const,
        label: 'Сон',
        samples: summary.value.sleepSamples,
        months: monthRows.value.filter((row) => row.summary.sleepSamples > 0).length,
        minimum: 6,
      },
      {
        id: 'energy' as const,
        label: 'Энергия',
        samples: summary.value.energySamples,
        months: monthRows.value.filter((row) => row.summary.energySamples > 0).length,
        minimum: 6,
      },
      {
        id: 'weight' as const,
        label: 'Вес',
        samples: summary.value.weightSamples,
        months: monthRows.value.filter((row) => row.summary.weightSamples > 0).length,
        minimum: 3,
      },
    ];
    return definitions.filter((metric) => metric.samples >= metric.minimum && metric.months >= 2);
  });
  watch(
    trendMetricOptions,
    (options) => {
      if (!options.some((option) => option.id === selectedTrendMetric.value) && options[0]) {
        selectedTrendMetric.value = options[0].id;
      }
    },
    { immediate: true },
  );
  const selectedTrendMetricInfo = computed(() => trendMetricOptions.value.find((option) => option.id === selectedTrendMetric.value));
  const eventLines = computed(() =>
    monthRows.value.flatMap((row) => {
      const events = lifeEvents.value.filter((event) => event.date.startsWith(row.monthStart.slice(0, 7)));
      return events.length
        ? [
            {
              name: events.map((event) => `${formatDate(event.date, { day: 'numeric', month: 'short' })}: ${event.title}`).join('\n'),
              xAxis: row.label,
            },
          ]
        : [];
    }),
  );
  const trendMetricValues = computed(() =>
    monthRows.value.map((row) => {
      if (selectedTrendMetric.value === 'sleep') {
        return minutesToHours(row.summary.averageSleep);
      }
      if (selectedTrendMetric.value === 'energy') {
        return roundValue(row.summary.averageEnergy);
      }
      return roundValue(row.summary.averageWeightKg);
    }),
  );
  const trendMetricDescription = computed(() => {
    const metric = selectedTrendMetric.value;
    const values = monthRows.value
      .map((row, index) => {
        const value = trendMetricValues.value[index];
        return value === null ? null : `${row.label}: ${formatTrendTooltipValue(metric, value)} (измерений: ${trendMetricSamples(index)})`;
      })
      .filter((value): value is string => Boolean(value));
    return `${selectedTrendMetricInfo.value?.label ?? 'Показатель'}: ${selectedTrendMetricInfo.value?.samples ?? 0} наблюдений. Месячные значения: ${values.join('; ')}. Текущий месяц может быть неполным; совпадение с событиями не доказывает причину.`;
  });
  function trendMetricSamples(index: number) {
    const summary = monthRows.value[index]?.summary;
    if (selectedTrendMetric.value === 'sleep') {
      return summary?.sleepSamples ?? 0;
    }
    if (selectedTrendMetric.value === 'energy') {
      return summary?.energySamples ?? 0;
    }
    return summary?.weightSamples ?? 0;
  }
  const trendMetricOption = computed<EChartsCoreOption>(() => {
    const metric = selectedTrendMetric.value;
    let axis: Record<string, unknown> = { scale: true, formatter: '{value}кг' };
    let color: string = chartColors.weight;
    if (metric === 'sleep') {
      axis = { min: 0, max: 12, formatter: '{value}ч' };
      color = chartColors.sleep;
    } else if (metric === 'energy') {
      axis = { min: 1, max: 5, formatter: '{value}' };
      color = chartColors.energy;
    }
    return {
      color: [color],
      tooltip: { trigger: 'axis' },
      grid: { left: 52, right: 24, top: 20, bottom: 34 },
      xAxis: {
        type: 'category',
        data: monthRows.value.map((row) => row.label),
        axisTick: { show: false },
        axisLine: { lineStyle: chartStyles.axisLine },
        axisLabel: chartStyles.axisLabel,
      },
      yAxis: {
        type: 'value',
        ...axis,
        axisLabel: { formatter: axis.formatter, color: chartColors.axis },
        splitLine: { lineStyle: chartStyles.splitLine },
      },
      series: [
        {
          name: selectedTrendMetricInfo.value?.label,
          type: 'line',
          symbolSize: 8,
          data: trendMetricValues.value,
          connectNulls: false,
          lineStyle: { width: 3 },
          tooltip: {
            valueFormatter: (value: unknown, dataIndex: number) =>
              `${formatTrendTooltipValue(metric, value)} (измерений: ${trendMetricSamples(dataIndex)})`,
          },
          markLine: {
            symbol: ['none', 'none'],
            lineStyle: { color: chartColors.event, type: 'dashed', width: 1.5 },
            label: { show: false },
            tooltip: { formatter: (params: { data?: { name?: string } }) => params.data?.name ?? 'Важное событие' },
            data: eventLines.value,
          },
        },
      ],
    };
  });

  function eventKey(event: (typeof store.lifeEvents)[number]): string {
    return `${event.date}|${event.createdAt}`;
  }
  watch(
    lifeEvents,
    (events) => {
      if (!events.some((event) => eventKey(event) === selectedEventKey.value)) {
        selectedEventKey.value = events[0] ? eventKey(events[0]) : '';
      }
    },
    { immediate: true },
  );
  watch(range, () => {
    timelinePage.value = 1;
  });
  const selectedEvent = computed(() => lifeEvents.value.find((event) => eventKey(event) === selectedEventKey.value) ?? null);
  const eventComparison = computed(() =>
    selectedEvent.value
      ? buildEventComparison(selectedEvent.value.date, store.dailyEntries, store.results, externalCareerIds.value, 14, end.value)
      : null,
  );
  const eventComparisonMetrics = computed(() =>
    (eventComparison.value?.metrics ?? []).filter(
      (metric) => metric.id === 'results' || ((metric.beforeSamples ?? 0) >= 3 && (metric.afterSamples ?? 0) >= 3),
    ),
  );

  function savedDate(updatedAt: string, fallback: string): string {
    if (!updatedAt) {
      return fallback;
    }
    const date = new Date(updatedAt);
    return Number.isNaN(date.getTime()) ? fallback : toDateKey(date);
  }
  function experimentTimelineContent(record: ExperimentRecord): Pick<DecisionTimelineItem, 'detail'> {
    const experimentSummary = buildExperimentSummary(store.dailyEntries, record);
    const parts = [`Вывод: ${record.conclusion}`];
    const decision = experimentDecisionLabel(record.decision);
    if (decision) {
      parts.push(`Дальше: ${decision.toLocaleLowerCase('ru-RU')}`);
    }
    if (!experimentSummary) {
      return { detail: parts.join('. ') };
    }
    parts.push(
      `Условие выполнено в ${experimentSummary.adherenceCompletedDays} из ${experimentSummary.adherenceMarkedDays} отмеченных дней; без отметки — ${experimentSummary.adherenceUnmarkedDays}`,
    );
    return { detail: parts.join('. ') };
  }

  const decisionTimeline = computed<DecisionTimelineItem[]>(() =>
    (
      [
        ...lifeEvents.value.map((event) => ({
          key: `event:${event.createdAt}`,
          date: event.date,
          type: 'Событие',
          tone: 'event',
          title: event.title,
          detail: event.note,
        })),
        ...results.value.map((result) => ({
          key: `result:${result.createdAt}`,
          date: result.date,
          type: 'Итог',
          tone: 'result',
          title: result.title,
          detail: result.note,
        })),
        ...store.weeklyReviews.flatMap((review) => {
          const date = savedDate(review.updatedAt, endOfWeek(review.weekStart));
          const items = [];
          if (review.nextLever || review.ifThenPlan) {
            items.push({
              key: `week:${review.weekStart}:decision`,
              date,
              type: 'Решение недели',
              tone: 'decision',
              title: review.nextLever || 'План недели',
              detail: review.ifThenPlan,
            });
          }
          if (review.previousPlanOutcome) {
            items.push({
              key: `week:${review.weekStart}:outcome`,
              date,
              type: 'Проверка решения',
              tone: 'outcome',
              title: review.previousPlanOutcome,
              detail: '',
            });
          }
          return items;
        }),
        ...store.monthlyReviews.map((review) => ({
          key: `month:${review.monthStart}:decision`,
          date: savedDate(review.updatedAt, endOfMonth(review.monthStart)),
          type: 'Решение месяца',
          tone: 'decision',
          title: review.nextFocus || review.courseChange || review.mainPattern || 'Обзор месяца',
          detail: review.ifThenPlan,
        })),
        ...store.settings.experimentHistory.map((record) => ({
          key: `experiment:${record.id}`,
          date: record.endDate,
          type: 'Эксперимент',
          tone: 'experiment',
          title: record.title,
          ...experimentTimelineContent(record),
        })),
      ] as DecisionTimelineItem[]
    )
      .filter((item) => item.date >= start.value && item.date <= end.value)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  const timelinePageCount = computed(() => pageCount(decisionTimeline.value.length, timelinePageSize));
  const displayedDecisionTimeline = computed(() => pageItems(decisionTimeline.value, timelinePage.value, timelinePageSize));
  watch(timelinePageCount, (count) => {
    timelinePage.value = Math.min(timelinePage.value, count);
  });
  const timelineSummary = computed<Array<{ tone: TimelineTone; label: string; count: number }>>(() =>
    [
      { tone: 'event' as const, label: 'События', count: decisionTimeline.value.filter((item) => item.tone === 'event').length },
      { tone: 'result' as const, label: 'Итоги', count: decisionTimeline.value.filter((item) => item.tone === 'result').length },
      { tone: 'decision' as const, label: 'Решения', count: decisionTimeline.value.filter((item) => item.tone === 'decision').length },
      { tone: 'outcome' as const, label: 'Проверки', count: decisionTimeline.value.filter((item) => item.tone === 'outcome').length },
      {
        tone: 'experiment' as const,
        label: 'Эксперименты',
        count: decisionTimeline.value.filter((item) => item.tone === 'experiment').length,
      },
    ].filter((item) => item.count > 0),
  );

  function formatComparisonValue(value: number | null, format: EventComparisonMetric['format']): string {
    if (value === null) {
      return '—';
    }
    if (format === 'minutes') {
      return formatMinutes(Math.round(value));
    }
    if (format === 'number') {
      return `${roundValue(value)}/5`;
    }
    if (format === 'weight') {
      return `${roundValue(value)} кг`;
    }
    if (format === 'percent') {
      return `${Math.round(value)}%`;
    }
    return String(Math.round(value));
  }
  function observationLabel(samples: number | null): string {
    if (samples === null) {
      return '';
    }
    if (samples === 0) {
      return 'нет наблюдений';
    }
    const lastTwo = samples % 100;
    const last = samples % 10;
    let noun = 'наблюдений';
    if (lastTwo < 11 || lastTwo > 14) {
      if (last === 1) {
        noun = 'наблюдение';
      } else if (last >= 2 && last <= 4) {
        noun = 'наблюдения';
      }
    }
    return `${samples} ${noun}`;
  }
  function selectEvent(event: (typeof store.lifeEvents)[number]) {
    selectedEventKey.value = eventKey(event);
  }
  function createPackage() {
    return buildRangePackage(range.value, todayKey(), {
      entries: store.dailyEntries,
      results: store.results,
      lifeEvents: store.lifeEvents,
      reviews: store.weeklyReviews,
      monthlyReviews: store.monthlyReviews,
      settings: store.settings,
    });
  }
  async function copyPrompt() {
    try {
      await copyPackagePrompt(createPackage(), store.settings);
      notifySaved(`Текст за ${range.value} мес. скопирован`);
    } catch (error) {
      notifyUnknownError(error, 'Не удалось подготовить текст для нейросети');
    }
  }
  function downloadJson() {
    try {
      downloadAiPackage(createPackage());
      notifyInfo(`Скачивание данных за ${range.value} мес. начато`);
    } catch (error) {
      notifyUnknownError(error, 'Не удалось скачать данные');
    }
  }
  function minutesToHours(value: number | null): number | null {
    return value === null ? null : Math.round((value / 60) * 10) / 10;
  }
  function roundValue(value: number | null): number | null {
    return value === null ? null : Math.round(value * 10) / 10;
  }

  function formatTrendTooltipValue(metric: TrendMetricId, rawValue: unknown): string {
    const value = numericTrendValue(rawValue);
    if (value === null) {
      return '—';
    }
    const formatted = value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    if (metric === 'sleep') {
      return `${formatted} ч`;
    }
    if (metric === 'energy') {
      return `${formatted}/5`;
    }
    return `${formatted} кг`;
  }

  function numericTrendValue(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const item = value[index];
        if (typeof item === 'number' && Number.isFinite(item)) {
          return item;
        }
      }
      return null;
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return numericTrendValue(value.value);
    }
    return null;
  }

  return {
    range,
    timelinePage,
    timelinePageCount,
    selectedEventKey,
    selectedTrendMetric,
    rangeOptions,
    summary,
    primaryCues,
    trendMetricOptions,
    selectedTrendMetricInfo,
    trendMetricOption,
    trendMetricDescription,
    eventKey,
    selectedEvent,
    eventComparison,
    eventComparisonMetrics,
    lifeEvents,
    decisionTimeline,
    displayedDecisionTimeline,
    timelineSummary,
    formatComparisonValue,
    observationLabel,
    selectEvent,
    copyPrompt,
    downloadJson,
    formatDate,
  };
}
