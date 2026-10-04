<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { init, use } from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption;
    height?: number;
    ariaLabel?: string;
    description: string;
  }>(),
  {
    height: 300,
    ariaLabel: 'График',
  },
);

const chartEl = ref<HTMLDivElement>();
const descriptionId = `chart-description-${useId()}`;
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

function render() {
  if (!chart) {
    return;
  }
  chart.setOption(props.option, true);
}

function resize() {
  chart?.resize();
}

onMounted(async () => {
  await nextTick();
  if (!chartEl.value) {
    return;
  }
  chart = init(chartEl.value, null, { renderer: 'canvas' });
  render();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(chartEl.value);
});

watch(() => props.option, render, { deep: true });
watch(
  () => props.height,
  () => nextTick(resize),
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div
    ref="chartEl"
    class="echart-panel"
    :style="{ height: `${height}px` }"
    role="img"
    :aria-label="ariaLabel"
    :aria-describedby="descriptionId"
  ></div>
  <p :id="descriptionId" class="visually-hidden">{{ description }}</p>
</template>

<style scoped>
.echart-panel {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 240px;
  overflow: hidden;
  border: 1px solid var(--chart-panel-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface), var(--chart-panel-gradient));
  box-shadow:
    inset 0 1px 0 var(--chart-panel-highlight),
    0 8px 20px var(--chart-panel-shadow);
}
</style>
