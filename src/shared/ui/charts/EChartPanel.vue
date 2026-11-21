<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

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
const unavailable = ref(false);
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
  try {
    const engine = await import('./engine');
    await nextTick();
    if (!chartEl.value) {
      return;
    }
    chart = engine.init(chartEl.value, null, { renderer: 'canvas' });
    render();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(chartEl.value);
  } catch {
    unavailable.value = true;
  }
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
    v-if="!unavailable"
    ref="chartEl"
    class="echart-panel"
    :style="{ height: `${height}px` }"
    role="img"
    :aria-label="ariaLabel"
    :aria-describedby="descriptionId"
  ></div>
  <p v-if="unavailable" class="chart-unavailable" role="status">График не загрузился. Обновите страницу, когда появится сеть.</p>
  <p :id="descriptionId" :class="{ 'visually-hidden': !unavailable }">{{ description }}</p>
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
.chart-unavailable {
  font-weight: 700;
}
</style>
