<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { RouterLink } from 'vue-router';
import EventComparisonDetails from '@/features/analytics/ui/EventComparisonDetails.vue';
import HistoryOverviewCard from '@/features/analytics/ui/HistoryOverviewCard.vue';
import HistoryRangeTabs from '@/features/analytics/ui/HistoryRangeTabs.vue';
import HistoryTimeline from '@/features/analytics/ui/HistoryTimeline.vue';
import TrendMetricDetails from '@/features/analytics/ui/TrendMetricDetails.vue';
import { useChangeHistoryView } from '@/features/analytics/useChangeHistoryView';
import ReviewHeading from '@/features/reviews/ui/ReviewPageHeading.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import ReviewNudge from '@/shared/ui/content/ReviewNudge.vue';
import PeriodEmptyGuide from '@/shared/ui/content/PeriodEmptyGuide.vue';

const {
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
} = useChangeHistoryView();
</script>

<template>
  <PageShell class="page--review page--trends">
    <ReviewHeading
      label="3–12 месяцев"
      title="История изменений"
      summary="Посмотрите, что происходило в разные месяцы и как менялись ваши записи."
    />

    <HistoryRangeTabs v-model="range" :options="rangeOptions" />

    <PeriodEmptyGuide v-if="summary.coveredEntriesCount === 0 && decisionTimeline.length === 0">
      <strong>Для истории пока нет записей</strong>
      <p>Здесь появятся важные события, итоги и сохранённые решения.</p>
      <ActionButton :as="RouterLink" variant="secondary" to="/today">Перейти к записи за день</ActionButton>
    </PeriodEmptyGuide>

    <template v-else>
      <HistoryOverviewCard
        v-if="summary.coveredEntriesCount"
        :cues="primaryCues"
        :covered-entries="summary.coveredEntriesCount"
        :ordinary-entries="summary.ordinaryCoreEntriesCount"
        @copy="copyPrompt"
        @download="downloadJson"
      />
      <HistoryTimeline
        v-if="decisionTimeline.length"
        v-model:page="timelinePage"
        :items="displayedDecisionTimeline"
        :summary="timelineSummary"
        :total="decisionTimeline.length"
        :page-count="timelinePageCount"
      />
      <TrendMetricDetails
        v-if="summary.coveredEntriesCount"
        v-model="selectedTrendMetric"
        :options="trendMetricOptions"
        :selected-label="selectedTrendMetricInfo?.label"
        :selected-samples="selectedTrendMetricInfo?.samples"
        :chart-option="trendMetricOption"
        :description="trendMetricDescription"
      />
      <EventComparisonDetails
        v-if="lifeEvents.length"
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
    </template>
    <ReviewNudge class="range-custom-action">
      <div>
        <strong>Данные для анализа за другие даты</strong>
        <p>Выберите точные даты и подготовьте текст в настройках.</p>
      </div>
      <ActionButton :as="RouterLink" variant="secondary" to="/settings#analysis-settings">Перейти к экспорту</ActionButton>
    </ReviewNudge>
  </PageShell>
</template>

<style scoped>
.range-custom-action {
  margin-bottom: 16px;
}
@media (max-width: 720px) {
  .range-custom-action {
    gap: 10px;
    padding: 14px 15px;
  }
}
</style>
