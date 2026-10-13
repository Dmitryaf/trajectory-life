<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import ArchivePagination from '@/features/journal/ui/ArchivePagination.vue';
import CountBadge from '@/shared/ui/data-display/CountBadge.vue';
import { formatDate } from '@/services/dates';
import type { TimelineTone } from '@/features/analytics/useChangeHistoryView';

type TimelineItem = { key: string; date: string; type: string; tone: TimelineTone; title: string; detail: string };
type TimelineSummary = { tone: TimelineTone; label: string; count: number };

const props = defineProps<{ items: TimelineItem[]; summary: TimelineSummary[]; total: number; page: number; pageCount: number }>();
defineEmits<{ 'update:page': [value: number] }>();

const list = ref<HTMLElement>();
const reservedHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;
let resizeFrame = 0;

// Keep the space occupied by visited pages so shorter pages cannot move the controls or clamp scroll.
watch(
  () => props.page,
  () => {
    reservedHeight.value = Math.max(reservedHeight.value, list.value?.getBoundingClientRect().height ?? 0);
  },
  { flush: 'sync' },
);
watch(
  () => props.total,
  () => (reservedHeight.value = 0),
);

onMounted(() => {
  let previousWidth = list.value?.getBoundingClientRect().width ?? 0;
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry && Math.abs(entry.contentRect.width - previousWidth) > 1) {
      previousWidth = entry.contentRect.width;
      cancelAnimationFrame(resizeFrame);
      // Reset outside observer delivery: changing the observed height here can loop in WebKit.
      resizeFrame = requestAnimationFrame(() => {
        reservedHeight.value = 0;
      });
    }
  });
  if (list.value) {
    resizeObserver.observe(list.value);
  }
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(resizeFrame);
});
</script>

<template>
  <SurfaceCard kind="dashboard" class="history-timeline history-timeline--featured">
    <SectionHeading>
      <div>
        <EyebrowText>Основа истории</EyebrowText>
        <h2>События, решения и итоги</h2>
      </div>
      <CountBadge>{{ total }}</CountBadge>
    </SectionHeading>
    <div class="history-timeline__summary" aria-label="Состав истории">
      <span v-for="item in summary" :key="item.tone" :class="`history-timeline__summary-item--${item.tone}`">
        <i></i>{{ item.label }} <strong>{{ item.count }}</strong>
      </span>
    </div>
    <div ref="list" class="history-timeline__list" :style="{ minHeight: reservedHeight ? `${reservedHeight}px` : undefined }">
      <article v-for="item in items" :key="item.key" class="decision-timeline__item" :class="`history-timeline__item--${item.tone}`">
        <time>{{ formatDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' }) }}</time>
        <span>{{ item.type }}</span>
        <div>
          <strong>{{ item.title }}</strong>
          <p v-if="item.detail">{{ item.detail }}</p>
        </div>
      </article>
    </div>
    <ArchivePagination
      :page="page"
      :page-count="pageCount"
      context-label="истории изменений"
      preserve-control-position
      @update:page="$emit('update:page', $event)"
    />
  </SurfaceCard>
</template>

<style scoped>
.history-timeline {
  --section-accent: var(--amber);
  --history-timeline-tone: var(--history-timeline-marker);
  position: relative;
  margin-bottom: 16px;
  border-color: var(--line-success);
}
.history-timeline::before {
  content: '';
  position: absolute;
  top: 0;
  left: 24px;
  right: 24px;
  height: 3px;
  border-radius: 0 0 4px 4px;
  background: var(--section-accent);
}
.history-timeline > .section-heading {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--review-section-divider);
}
.history-timeline__list {
  position: relative;
  display: grid;
  align-content: start;
  gap: 7px;
}
.history-timeline__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}
.history-timeline__summary > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--history-timeline-border);
  border-radius: 999px;
  background: var(--history-timeline-surface);
  color: var(--empty-guide-text);
  font-size: 11px;
  font-weight: 750;
}
.history-timeline__summary i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--history-timeline-tone);
}
.history-timeline__summary strong {
  color: var(--navy);
}
.history-timeline__summary-item--event,
.history-timeline__item--event {
  --history-timeline-tone: var(--status-danger-bright);
}
.history-timeline__summary-item--result,
.history-timeline__item--result {
  --history-timeline-tone: var(--status-success);
}
.history-timeline__summary-item--decision,
.history-timeline__item--decision {
  --history-timeline-tone: var(--brand-strong);
}
.history-timeline__summary-item--outcome,
.history-timeline__item--outcome {
  --history-timeline-tone: var(--amber);
}
.history-timeline__summary-item--experiment,
.history-timeline__item--experiment {
  --history-timeline-tone: var(--orange);
}
.history-timeline__list > article {
  position: relative;
  display: grid;
  grid-template-columns: 105px 120px 1fr;
  gap: 14px;
  align-items: start;
  margin-left: 5px;
  padding: 14px 16px 14px 20px;
  border: 1px solid var(--history-timeline-item-border);
  border-left: 2px solid var(--history-timeline-line);
  border-radius: 0 14px 14px 0;
  background: var(--surface);
}
.history-timeline__list > article::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 18px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--line-inverse);
  border-radius: 50%;
  background: var(--history-timeline-tone);
  box-shadow: 0 0 0 1px var(--history-timeline-marker-ring);
}
.history-timeline__list time {
  color: var(--history-timeline-meta);
  font-size: 11px;
  font-weight: 750;
}
.history-timeline__list article > span {
  color: var(--history-timeline-text);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}
.history-timeline__list strong {
  display: block;
  color: var(--review-cue-title);
  font-size: 13px;
}
.history-timeline__list p {
  margin: 4px 0 0;
  color: var(--history-timeline-text);
  font-size: 12px;
  line-height: 1.45;
}
@media (max-width: 720px) {
  .history-timeline__list > article {
    grid-template-columns: 86px minmax(0, 1fr);
  }
  .history-timeline__list article > div {
    grid-column: 1 / -1;
  }
}
</style>
