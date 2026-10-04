<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import type { EChartsCoreOption } from 'echarts/core';
import PeriodDetails from '@/features/reviews/ui/PeriodDetails.vue';
import MetricSwitcher from '@/features/reviews/ui/MetricSwitcher.vue';
import ReviewNotice from '@/features/reviews/ui/ReviewNotice.vue';
import EChartPanel from '@/shared/ui/charts/EChartPanel.vue';

defineProps<{
  options: Array<{ id: string; label: string; samples: number }>;
  modelValue: string;
  selectedLabel?: string;
  selectedSamples?: number;
  chartOption: EChartsCoreOption;
  description: string;
}>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <PeriodDetails class="trends-metric-details" title="Показать один показатель по месяцам">
    <SurfaceCard v-if="options.length" kind="dashboard" class="trend-metric-card">
      <SectionHeading>
        <div>
          <EyebrowText>Динамика периода</EyebrowText>
          <h2>{{ selectedLabel }}</h2>
        </div>
        <small>{{ selectedSamples }} наблюдений · минимум два месяца</small>
      </SectionHeading>
      <MetricSwitcher
        :model-value="modelValue"
        class="trend-metric-switcher"
        :options="options"
        label="Показатель графика"
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <EChartPanel :option="chartOption" :height="300" :aria-label="`Динамика: ${selectedLabel}`" :description="description" />
      <DataNote class="trend-chart-description">
        Показаны месячные средние и важные события. Совпадение изменений во времени не доказывает причину; текущий месяц может быть
        неполным.
      </DataNote>
    </SurfaceCard>
    <ReviewNotice v-else class="trends-chart-guide">
      <strong>Для графика пока мало сопоставимых данных</strong>
      <p>Нужны наблюдения хотя бы в двух месяцах: 6 для сна или энергии либо 3 измерения веса.</p>
    </ReviewNotice>
  </PeriodDetails>
</template>

<style scoped>
.trend-metric-card {
  --section-accent: var(--purple);
  position: relative;
  margin-bottom: 16px;
  border-color: var(--line-success);
}
.trend-metric-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 24px;
  right: 24px;
  height: 3px;
  border-radius: 0 0 4px 4px;
  background: var(--section-accent);
}
.trend-metric-card > .section-heading {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--review-section-divider);
}
.trend-metric-switcher {
  margin-bottom: 14px;
}
.data-note {
  margin: 10px 0 0;
  color: var(--data-note-text);
  font-size: 12px;
  line-height: 1.5;
}
</style>
