<script setup lang="ts">
import PeriodReviewActions from '@/features/reviews/ui/PeriodReviewActions.vue';
import MonthDailyNotes from '@/features/reviews/ui/MonthDailyNotes.vue';
import MonthReviewContext from '@/features/reviews/ui/MonthReviewContext.vue';
import SelfReminderReview from '@/features/self-reminders/ui/SelfReminderReview.vue';
import MonthSectionLinks from '@/features/reviews/ui/MonthSectionLinks.vue';
import MonthWeekReviews from '@/features/reviews/ui/MonthWeekReviews.vue';
import MonthWeekComparison from '@/features/reviews/ui/MonthWeekComparison.vue';
import { monthWeekReviews, monthWeekSummariesForPeriod } from '@/features/reviews/monthWeeks';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { EChartsCoreOption } from 'echarts/core';
import ArchivePagination from '@/features/journal/ui/ArchivePagination.vue';
import PeriodRecordCard from '@/features/reviews/ui/PeriodRecordCard.vue';
import PeriodAnalysisCard from '@/features/reviews/ui/PeriodAnalysisCard.vue';
import PeriodDetails from '@/features/reviews/ui/PeriodDetails.vue';
import ReviewHeading from '@/features/reviews/ui/ReviewPageHeading.vue';
import ReviewNotice from '@/features/reviews/ui/ReviewNotice.vue';
import MetricSwitcher from '@/features/reviews/ui/MetricSwitcher.vue';
import { usePeriodReview } from '@/features/reviews/usePeriodReview';
import { validDate } from '@/model/normalization';
import EChartPanel from '@/shared/ui/charts/EChartPanel.vue';
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import PeriodNavigator from '@/shared/ui/navigation/PeriodNavigator.vue';
import Badge from '@/shared/ui/data-display/CountBadge.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import ReviewEmptyPeriod from '@/features/reviews/ui/ReviewEmptyPeriod.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { chartColors as c, chartStyles as s } from '@/shared/theme/colors';
import {
  actionDirectionLabel,
  buildObservations,
  buildReviewCues,
  selectPrimaryReviewCues,
  entriesForMonth,
  resultsForPeriod,
  specialDayLabel,
  summarize,
} from '@/features/analytics';
import { dateRange, endOfMonth, formatDate, startOfMonth, todayKey } from '@/services/dates';
import { buildWeightSeries } from '@/features/analytics/weightSeries';
import { pageCount, pageItems } from '@/services/pagination';
import { useAppStore } from '@/stores/app';
import {
  actionDirectionOptions,
  contextFactorOptions,
  emptyMonthlyReview,
  externalCareerIdsForOptions,
  lifeAreaOptions,
  lifeEventTypeOptions,
  resultAreaOptions,
  type MonthlyReview,
} from '@/types';

const store = useAppStore();
const { initialMonth = '' } = defineProps<{ initialMonth?: string }>();
const anchor = ref(validDate(initialMonth) || todayKey());
watch(
  () => initialMonth,
  (value) => (anchor.value = validDate(value) || todayKey()),
);
const start = computed(() => startOfMonth(anchor.value));
const end = computed(() => endOfMonth(anchor.value));
const archiveEnd = computed(() => (end.value > todayKey() ? todayKey() : end.value));
const entries = computed(() => entriesForMonth(store.dailyEntries, anchor.value));
const externalCareerIds = computed(() => externalCareerIdsForOptions(store.settings.customCareerOptions));
const summary = computed(() => summarize(entries.value, externalCareerIds.value));
const contextFactorItems = computed(() => [...contextFactorOptions, ...store.settings.customContextFactorOptions]);
const observations = computed(() => buildObservations(entries.value, contextFactorItems.value));
const results = computed(() => resultsForPeriod(store.results, start.value, end.value));
const lifeEvents = computed(() =>
  store.lifeEvents.filter((event) => event.date >= start.value && event.date <= end.value).sort((a, b) => b.date.localeCompare(a.date)),
);
const primaryReviewCues = computed(() =>
  selectPrimaryReviewCues(
    buildReviewCues('month', entries.value, results.value, lifeEvents.value, externalCareerIds.value, contextFactorItems.value),
  ),
);
const additionalObservations = computed(() =>
  observations.value.filter((observation) => !['special-days', 'context-factor'].includes(observation.id)),
);
const hasDailyData = computed(() => summary.value.coveredEntriesCount > 0);
const hasJournal = computed(() => results.value.length > 0 || lifeEvents.value.length > 0);
const savedWeeks = computed(() => monthWeekReviews(store.weeklyReviews, start.value, archiveEnd.value));
const hasDailyNotes = computed(() => entries.value.some((entry) => entry.importantFact.trim()));
const hasPeriodData = computed(() => hasDailyData.value || hasJournal.value || hasSavedReview.value || savedWeeks.value.length > 0);
const monthDates = computed(() => dateRange(start.value, end.value));
const chartDates = computed(() => monthDates.value.filter((date) => date <= todayKey()));
const monthWeekSummaries = computed(() =>
  monthWeekSummariesForPeriod(entries.value, results.value, lifeEvents.value, start.value, archiveEnd.value, externalCareerIds.value),
);
const entriesByDate = computed(() => new Map(entries.value.map((entry) => [entry.date, entry])));
const sleepEntries = computed(() =>
  [...entries.value]
    .filter((entry) => entry.specialDay === null && entry.sleepMinutes !== null)
    .sort((a, b) => a.date.localeCompare(b.date)),
);
const energyEntries = computed(() =>
  [...entries.value].filter((entry) => entry.specialDay === null && entry.energy !== null).sort((a, b) => a.date.localeCompare(b.date)),
);
const weightEntries = computed(() =>
  entries.value
    .filter((entry) => entry.date <= todayKey() && entry.specialDay === null && entry.weightKg !== null)
    .sort((a, b) => a.date.localeCompare(b.date)),
);
type MonthMetricId = 'sleep' | 'energy' | 'weight';
const selectedMonthMetric = ref<MonthMetricId>('sleep');
const monthMetricOptions = computed(() =>
  [
    { id: 'sleep' as const, label: 'Сон', samples: sleepEntries.value.length, available: sleepEntries.value.length >= 4 },
    { id: 'energy' as const, label: 'Энергия', samples: energyEntries.value.length, available: energyEntries.value.length >= 4 },
    { id: 'weight' as const, label: 'Вес', samples: weightEntries.value.length, available: weightEntries.value.length > 0 },
  ].filter((option) => option.available),
);
watch(
  monthMetricOptions,
  (options) => {
    if (!options.some((option) => option.id === selectedMonthMetric.value) && options[0]) {
      selectedMonthMetric.value = options[0].id;
    }
  },
  { immediate: true },
);
const sleepOption = computed<EChartsCoreOption>(() => {
  const rows = chartDates.value.map((date) => {
    const entry = entriesByDate.value.get(date);
    return { date, entry: entry?.specialDay === null ? entry : undefined };
  });
  return {
    color: [c.sleep],
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} ч` },
    grid: { left: 46, right: 24, top: 20, bottom: 34 },
    xAxis: {
      type: 'category',
      data: rows.map((row) => formatDate(row.date, { day: 'numeric' })),
      axisTick: { show: false },
      axisLine: { lineStyle: s.axisLine },
      axisLabel: s.axisLabel,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 12,
      interval: 3,
      axisLabel: { formatter: '{value}ч', color: c.axis },
      splitLine: { lineStyle: s.splitLine },
    },
    series: [
      {
        name: 'Сон',
        type: 'line',
        data: rows.map((row) => minutesToHours(row.entry?.sleepMinutes ?? null)),
        symbolSize: 8,
        connectNulls: false,
        lineStyle: { width: 3 },
      },
    ],
  };
});
const energyOption = computed<EChartsCoreOption>(() => ({
  color: [c.energy],
  tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value}/5` },
  grid: { left: 42, right: 24, top: 20, bottom: 34 },
  xAxis: {
    type: 'category',
    data: chartDates.value.map((date) => formatDate(date, { day: 'numeric' })),
    axisTick: { show: false },
    axisLine: { lineStyle: s.axisLine },
    axisLabel: s.axisLabel,
  },
  yAxis: {
    type: 'value',
    min: 1,
    max: 5,
    interval: 1,
    axisLabel: s.axisLabel,
    splitLine: { lineStyle: s.splitLine },
  },
  series: [
    {
      name: 'Энергия',
      type: 'line',
      data: chartDates.value.map((date) => {
        const entry = entriesByDate.value.get(date);
        return entry?.specialDay === null ? entry.energy : null;
      }),
      symbolSize: 8,
      connectNulls: false,
      lineStyle: { width: 3 },
    },
  ],
}));
const weightOption = computed<EChartsCoreOption>(() => {
  const rows = buildWeightSeries(monthDates.value, store.dailyEntries, todayKey());
  const rollingSeries = rows.some((row) => row.rolling !== null)
    ? [
        {
          name: 'среднее за 7 дней',
          type: 'line',
          symbolSize: 8,
          data: rows.map((row) => row.rolling),
          connectNulls: false,
          lineStyle: { width: 3 },
        },
      ]
    : [];
  return {
    color: [c.weight, c.deepGreen],
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: c.legend, fontSize: 12 } },
    grid: { left: 52, right: 24, top: 42, bottom: 34 },
    xAxis: {
      type: 'category',
      data: rows.map((row) => formatDate(row.date, { day: 'numeric' })),
      axisTick: { show: false },
      axisLine: { lineStyle: s.axisLine },
      axisLabel: s.axisLabel,
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { formatter: '{value}кг', color: c.axis },
      splitLine: { lineStyle: s.splitLine },
    },
    series: [
      { name: 'измерение', type: 'line', symbolSize: 7, data: rows.map((row) => row.weight), lineStyle: { width: 1, opacity: 0.4 } },
      ...rollingSeries,
    ],
  };
});
const monthMetricOption = computed(() => {
  if (selectedMonthMetric.value === 'weight') {
    return weightOption.value;
  }
  if (selectedMonthMetric.value === 'energy') {
    return energyOption.value;
  }
  return sleepOption.value;
});
const selectedMonthMetricInfo = computed(() => monthMetricOptions.value.find((option) => option.id === selectedMonthMetric.value));
const monthMetricDescription = computed(() => {
  const metric = selectedMonthMetric.value;
  const rows = {
    energy: energyEntries.value,
    sleep: sleepEntries.value,
    weight: weightEntries.value,
  }[metric];
  const values = rows.map((entry) => {
    const date = formatDate(entry.date, { day: 'numeric', month: 'short' });
    if (metric === 'sleep') {
      return `${date}: ${minutesToHours(entry.sleepMinutes)} ч`;
    }
    if (metric === 'energy') {
      return `${date}: ${entry.energy}/5`;
    }
    return `${date}: ${entry.weightKg} кг`;
  });
  return `${selectedMonthMetricInfo.value?.label ?? 'Показатель'}: ${rows.length} наблюдений. ${values.join('; ')}. Особые дни исключены, пропуски не заполняются.`;
});
const contextNotes = computed(() => entries.value.filter((entry) => entry.contextNote.trim()).sort((a, b) => b.date.localeCompare(a.date)));
const actionNotes = computed(() =>
  entries.value.filter((entry) => entry.actionDirection !== null).sort((a, b) => b.date.localeCompare(a.date)),
);
const specialDays = computed(() => entries.value.filter((entry) => entry.specialDay !== null).sort((a, b) => b.date.localeCompare(a.date)));
const contextEntries = computed(() =>
  entries.value.filter((entry) => entry.contextNote.trim() || entry.specialDay !== null).sort((a, b) => b.date.localeCompare(a.date)),
);
const actionPage = ref(1);
const contextPage = ref(1);
const recordPageSize = 7;
const visibleActionNotes = computed(() => pageItems(actionNotes.value, actionPage.value, recordPageSize));
const actionPageCount = computed(() => pageCount(actionNotes.value.length, recordPageSize));
const visibleContextEntries = computed(() => pageItems(contextEntries.value, contextPage.value, recordPageSize));
const contextPageCount = computed(() => pageCount(contextEntries.value.length, recordPageSize));
const actionDirectionSummary = computed(() =>
  actionDirectionOptions
    .map((option) => ({ ...option, count: actionNotes.value.filter((entry) => entry.actionDirection === option.id).length }))
    .filter((option) => option.count > 0),
);
const resultAreaItems = computed(() => [...resultAreaOptions, ...store.settings.customLifeAreaOptions]);
const resultAreaSummary = computed(() => {
  const knownAreas = resultAreaItems.value;
  const unknownAreas = [...new Set(results.value.map((result) => result.area))]
    .filter((area) => !knownAreas.some((option) => option.id === area))
    .map((area) => ({ id: area, label: area, icon: '·' }));

  return [...knownAreas, ...unknownAreas]
    .map((option) => ({ ...option, count: results.value.filter((result) => result.area === option.id).length }))
    .filter((option) => option.count > 0);
});
const eventTypeSummary = computed(() =>
  lifeEventTypeOptions
    .map((option) => ({ ...option, count: lifeEvents.value.filter((event) => event.type === option.id).length }))
    .filter((option) => option.count > 0),
);
const resultRecordItems = computed(() =>
  results.value.map((result) => ({
    id: result.id ?? result.createdAt,
    icon: resultAreaItems.value.find((option) => option.id === result.area)?.icon ?? '·',
    title: result.title,
    dateLabel: formatDate(result.date, { day: 'numeric', month: 'short' }),
  })),
);
const eventRecordItems = computed(() =>
  lifeEvents.value.map((event) => ({
    id: event.id ?? event.createdAt,
    icon: lifeEventTypeOptions.find((option) => option.id === event.type)?.icon ?? '·',
    title: event.title,
    dateLabel: formatDate(event.date, { day: 'numeric', month: 'short' }),
  })),
);
const lifeAreaItems = computed(() => [...lifeAreaOptions, ...store.settings.customLifeAreaOptions]);
const activeAreas = computed(() => lifeAreaItems.value.filter((option) => store.settings.activeLifeAreas.includes(option.id)));
const {
  navigation,
  copyPrompt,
  downloadJson,
  hasSavedReview,
  promptCopying,
  review,
  reviewAvailable,
  reviewHint,
  reviewContextOpen,
  reviewHasContext,
  actions,
  updateReviewContextOpen,
} = usePeriodReview<MonthlyReview>({
  period: 'month',
  anchor,
  start,
  end,
  emptyReview: emptyMonthlyReview,
  findReview: (monthStart) => store.reviewByMonth(monthStart),
  persistReview: (draft, expected, key) => store.saveMonthlyReview(draft, expected, key),
  hasContext: (draft) => Boolean(draft.mainPattern.trim() || draft.support.trim() || draft.obstacle.trim() || draft.courseChange.trim()),
  afterLoad: () => {
    actionPage.value = 1;
    contextPage.value = 1;
  },
});
watch(actionPageCount, (count) => {
  actionPage.value = Math.min(actionPage.value, count);
});
watch(contextPageCount, (count) => {
  contextPage.value = Math.min(contextPage.value, count);
});

function minutesToHours(value: number | null): number | null {
  return value === null ? null : Math.round((value / 60) * 10) / 10;
}
</script>

<template>
  <PageShell class="page--review page--month">
    <ReviewHeading
      title="Месяц"
      summary="Сравните недели, вспомните важные события и сделанные дела. При желании запишите планы."
      :href="reviewAvailable ? '#month-review' : undefined"
      period="month"
    />
    <PeriodNavigator
      :title="formatDate(start, { month: 'long', year: 'numeric' })"
      :subtitle="start === startOfMonth(todayKey()) ? 'Текущий месяц' : ''"
      :hint="reviewHint"
      v-on="navigation"
    />
    <MonthSectionLinks :daily-notes="hasDailyNotes" :week-reviews="Boolean(savedWeeks.length)" />

    <ReviewEmptyPeriod v-if="!hasPeriodData" period="month" :available="reviewAvailable" />

    <template v-if="hasPeriodData || reviewAvailable">
      <ReviewNotice v-if="hasPeriodData && !hasDailyData" tag="section" class="period-data-guide">
        <strong>За этот месяц нет дневных записей</strong>
        <p>Сохранённые обзоры, итоги и события показаны ниже. Для воспоминаний о месяце дневные измерения не обязательны.</p>
      </ReviewNotice>

      <MonthWeekComparison v-if="hasDailyData" :weeks="monthWeekSummaries" :covered-days="summary.coveredEntriesCount" />

      <section v-if="hasJournal" class="period-records period-records--featured">
        <PeriodRecordCard
          v-if="results.length"
          eyebrow="Сделанные дела"
          title="Итоги месяца"
          :items="resultRecordItems"
          :breakdown="resultAreaSummary"
          breakdown-label="Итоги по областям"
          pagination-label="итогов месяца"
        />
        <PeriodRecordCard
          v-if="lifeEvents.length"
          eyebrow="Из журнала"
          title="События месяца"
          :items="eventRecordItems"
          :breakdown="eventTypeSummary"
          breakdown-label="События по типам"
          pagination-label="событий месяца"
        />
      </section>

      <MonthDailyNotes :entries="entries" />
      <MonthWeekReviews :weeks="savedWeeks" />

      <SurfaceCard v-if="reviewAvailable" id="month-review" kind="review">
        <SectionHeading>
          <div>
            <EyebrowText>Сохранить вывод</EyebrowText>
            <h2>Обзор месяца</h2>
          </div>
          <small>{{ formatDate(end, { day: 'numeric', month: 'long' }) }}</small>
        </SectionHeading>
        <MonthReviewContext
          v-model:main-pattern="review.mainPattern"
          v-model:support="review.support"
          v-model:obstacle="review.obstacle"
          v-model:course-change="review.courseChange"
          :has-context="reviewHasContext"
          :open="reviewContextOpen"
          @toggle="updateReviewContextOpen"
        />
        <SelfReminderReview :key="start" />
        <FormFieldLabel>Чему хотите уделить внимание в следующем месяце?</FormFieldLabel
        ><AutoGrowTextarea v-model="review.nextFocus" :rows="2" placeholder="Что стоит продолжить, изменить или проверить" />
        <PeriodReviewActions :actions="actions" label="Сохранить обзор месяца" />
      </SurfaceCard>
      <ReviewNotice v-else id="month-review" tag="section">
        <strong>Обзор появится в конце месяца</strong>
        <p>Обзор необязателен. Дневные записи сохранятся.</p>
      </ReviewNotice>

      <PeriodAnalysisCard
        v-if="hasDailyData || hasJournal"
        title="На что обратить внимание"
        :cues="primaryReviewCues"
        :copying="promptCopying"
        @copy="copyPrompt"
        @download="downloadJson"
      />

      <PeriodDetails v-if="hasDailyData" v-slot="{ expanded }" class="month-analysis-details" title="Показать графики и сравнения">
        <SurfaceCard v-if="additionalObservations.length" kind="dashboard">
          <SectionHeading>
            <div>
              <EyebrowText>Сравнение дней</EyebrowText>
              <h2>Что ещё видно по данным</h2>
            </div>
          </SectionHeading>
          <div class="observation-grid">
            <article v-for="observation in additionalObservations" :key="observation.id" class="observation-card">
              <strong>{{ observation.title }}</strong>
              <p>{{ observation.text }}</p>
            </article>
          </div>
        </SurfaceCard>

        <SurfaceCard v-if="monthMetricOptions.length" kind="dashboard" class="month-metric-card">
          <SectionHeading>
            <div>
              <EyebrowText>Один показатель за раз</EyebrowText>
              <h2>{{ selectedMonthMetricInfo?.label }}</h2>
            </div>
            <small>{{ selectedMonthMetricInfo?.samples }} изм. · особые дни исключены</small>
          </SectionHeading>
          <MetricSwitcher v-model="selectedMonthMetric" :options="monthMetricOptions" label="Показатель графика" />
          <EChartPanel
            v-if="expanded"
            :option="monthMetricOption"
            :height="280"
            :aria-label="`Динамика: ${selectedMonthMetricInfo?.label}`"
            :description="monthMetricDescription"
          />
        </SurfaceCard>
        <ReviewNotice v-else class="month-chart-guide">
          <strong>Для графика пока мало данных</strong>
          <p>
            Нужны 4 обычных дня со сном или энергией либо 1 измерение веса. Сейчас: сон — {{ sleepEntries.length }}, энергия —
            {{ energyEntries.length }}, вес — {{ weightEntries.length }}.
          </p>
        </ReviewNotice>

        <SurfaceCard kind="dashboard">
          <SectionHeading>
            <div>
              <EyebrowText>Сколько дней появлялось</EyebrowText>
              <h2>Области жизни</h2>
            </div>
          </SectionHeading>
          <div class="coverage-list">
            <div v-for="area in activeAreas" :key="area.id" class="coverage-row">
              <span class="coverage-row__label"
                ><i>{{ area.icon }}</i
                >{{ area.label }}</span
              >
              <div class="coverage-row__track">
                <span
                  :style="{
                    width: `${summary.lifeAreaSamples ? ((summary.areaCounts[area.id] ?? 0) / summary.lifeAreaSamples) * 100 : 0}%`,
                  }"
                ></span>
              </div>
              <strong>{{ summary.areaCounts[area.id] ?? 0 }}/{{ summary.lifeAreaSamples }}</strong>
            </div>
          </div>
        </SurfaceCard>
      </PeriodDetails>

      <PeriodDetails
        v-if="actionNotes.length || contextEntries.length"
        class="period-records"
        title="Показать действия, заметки и особые дни"
      >
        <div class="period-records__content">
          <details v-if="actionNotes.length" class="period-record-card period-record-card--disclosure">
            <summary>
              <span class="period-record-card__heading">
                <span><EyebrowText>Действия по цели</EyebrowText><strong>Конкретные действия и подготовка</strong></span>
                <Badge>{{ actionNotes.length }}</Badge>
              </span>
              <span class="period-record-card__breakdown" aria-label="Действия по направлению">
                <span v-for="direction in actionDirectionSummary" :key="direction.id"
                  >{{ direction.icon }} {{ direction.label }} · {{ direction.count }}</span
                >
              </span>
            </summary>
            <div class="period-record-card__details">
              <div class="note-list note-list--columns">
                <article v-for="entry in visibleActionNotes" :key="entry.date" class="note-item">
                  <RouterLink :to="`/today?date=${entry.date}`"
                    ><time>{{ formatDate(entry.date, { day: 'numeric', month: 'short' }) }}</time></RouterLink
                  >
                  <p>
                    <strong>{{ actionDirectionLabel(entry.actionDirection) }}</strong
                    ><span v-if="entry.focusTitle"><br />Цель: {{ entry.focusTitle }}</span
                    ><span v-if="entry.actionNote"><br />{{ entry.actionNote }}</span>
                  </p>
                </article>
              </div>
              <ArchivePagination v-model:page="actionPage" :page-count="actionPageCount" context-label="действий месяца" />
            </div>
          </details>

          <details v-if="contextEntries.length" class="period-record-card period-record-card--disclosure">
            <summary>
              <span class="period-record-card__heading">
                <span><EyebrowText>По дням</EyebrowText><strong>Заметки и особые дни</strong></span>
                <Badge>{{ contextEntries.length }}</Badge>
              </span>
              <span class="period-record-card__breakdown">
                <span>Заметок: {{ contextNotes.length }}</span
                ><span>Особых дней: {{ specialDays.length }}</span>
              </span>
            </summary>
            <div class="period-record-card__details">
              <div class="note-list note-list--columns">
                <article v-for="entry in visibleContextEntries" :key="entry.date" class="note-item">
                  <RouterLink :to="`/today?date=${entry.date}`"
                    ><time>{{ formatDate(entry.date, { day: 'numeric', month: 'short' }) }}</time></RouterLink
                  >
                  <p>
                    <strong v-if="entry.specialDay">{{ specialDayLabel(entry.specialDay) }}</strong
                    ><span v-if="entry.specialDayNote"><br />{{ entry.specialDayNote }}</span
                    ><span v-if="entry.contextNote"><br />{{ entry.contextNote }}</span>
                  </p>
                </article>
              </div>
              <ArchivePagination v-model:page="contextPage" :page-count="contextPageCount" context-label="заметок и особых дней" />
            </div>
          </details>
        </div>
      </PeriodDetails>
    </template>
  </PageShell>
</template>

<style scoped src="./MonthView.css"></style>
