<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import EventComparisonDetails from '@/features/analytics/ui/EventComparisonDetails.vue';
import HistoryOverviewCard from '@/features/analytics/ui/HistoryOverviewCard.vue';
import HistoryRangeTabs from '@/features/analytics/ui/HistoryRangeTabs.vue';
import HistoryTimeline from '@/features/analytics/ui/HistoryTimeline.vue';
import TrendMetricDetails from '@/features/analytics/ui/TrendMetricDetails.vue';
import { useChangeHistoryView } from '@/features/analytics/useChangeHistoryView';
import ReviewHeading from '@/features/reviews/ui/ReviewPageHeading.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import PeriodAnalysisCard from '@/features/reviews/ui/PeriodAnalysisCard.vue';
import PeriodEmptyGuide from '@/shared/ui/content/PeriodEmptyGuide.vue';

const props = withDefaults(defineProps<{ initialHash?: string }>(), { initialHash: '' });
const {
  range,
  copying,
  allExperiments,
  hasArchivedExperiments,
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
} = useChangeHistoryView(computed(() => props.initialHash));
</script>

<template>
  <PageShell class="page--review page--trends">
    <ReviewHeading
      title="Динамика"
      :summary="allExperiments ? 'Личные эксперименты за всё время.' : 'События, наблюдения и изменения за несколько месяцев.'"
    />

    <ActionButton v-if="allExperiments" :as="RouterLink" variant="secondary" to="/trends">Вернуться к периоду</ActionButton>
    <HistoryRangeTabs v-else v-model="range" :options="rangeOptions" />

    <PeriodEmptyGuide v-if="allExperiments && !decisionTimeline.length">
      <strong>Завершённых экспериментов пока нет</strong>
    </PeriodEmptyGuide>
    <PeriodEmptyGuide v-else-if="summary.coveredEntriesCount === 0 && decisionTimeline.length === 0">
      <strong>За этот период пока нет записей</strong>
      <p>Здесь появятся важные события, итоги и сохранённые решения.</p>
      <ActionButton :as="RouterLink" variant="secondary" to="/today">Перейти к записи за день</ActionButton>
    </PeriodEmptyGuide>

    <template v-else>
      <HistoryOverviewCard
        v-if="!allExperiments && summary.coveredEntriesCount"
        :cues="primaryCues"
        :covered-entries="summary.coveredEntriesCount"
      />
      <HistoryTimeline
        v-if="decisionTimeline.length"
        :id="allExperiments ? 'experiments' : undefined"
        :key="range"
        v-model:page="timelinePage"
        :all-experiments="allExperiments"
        :items="displayedDecisionTimeline"
        :summary="timelineSummary"
        :total="decisionTimeline.length"
        :page-count="timelinePageCount"
      />
      <TrendMetricDetails
        v-if="!allExperiments && summary.coveredEntriesCount"
        v-model="selectedTrendMetric"
        :options="trendMetricOptions"
        :selected-label="selectedTrendMetricInfo?.label"
        :selected-samples="selectedTrendMetricInfo?.samples"
        :chart-option="trendMetricOption"
        :description="trendMetricDescription"
      />
      <EventComparisonDetails
        v-if="!allExperiments && lifeEvents.length"
        :events="lifeEvents"
        :selected-key="selectedEventKey"
        :selected-event="selectedEvent"
        :comparison="eventComparison"
        :metrics="eventComparisonMetrics"
        :event-key="eventKey"
        :format-value="formatComparisonValue"
        :observation-label="observationLabel"
        @select="selectEvent"
      />
      <PeriodAnalysisCard
        v-if="!allExperiments"
        content="external"
        :title="`Экспорт за ${range} мес.`"
        :cues="[]"
        :copying="copying"
        @copy="copyPrompt"
        @download="downloadJson"
      />
    </template>
    <RouterLink v-if="!allExperiments && hasArchivedExperiments" to="/trends#experiments">Все завершённые эксперименты</RouterLink>
  </PageShell>
</template>
