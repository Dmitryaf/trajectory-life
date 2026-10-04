<script setup lang="ts">
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { computed, ref, watch } from 'vue';
import ArchivePagination from '@/features/journal/ui/ArchivePagination.vue';
import CountBadge from '@/shared/ui/data-display/CountBadge.vue';

interface PeriodRecordItem {
  id: string | number;
  icon: string;
  title: string;
  dateLabel: string;
}

interface PeriodRecordBreakdownItem {
  id: string;
  icon?: string;
  label: string;
  count: number;
}

const props = withDefaults(
  defineProps<{
    eyebrow: string;
    title: string;
    items: PeriodRecordItem[];
    breakdown: PeriodRecordBreakdownItem[];
    breakdownLabel: string;
    paginationLabel: string;
    pageSize?: number;
  }>(),
  { pageSize: 5 },
);

const page = ref(1);
const pageCount = computed(() => Math.max(1, Math.ceil(props.items.length / props.pageSize)));
const visibleItems = computed(() => {
  const start = (page.value - 1) * props.pageSize;
  return props.items.slice(start, start + props.pageSize);
});

watch(
  () => props.items,
  () => {
    page.value = 1;
  },
);
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count);
});
</script>

<template>
  <article class="period-record-card">
    <div class="period-record-card__heading">
      <div>
        <EyebrowText>{{ eyebrow }}</EyebrowText>
        <h2>{{ title }}</h2>
      </div>
      <CountBadge>{{ items.length }}</CountBadge>
    </div>
    <div v-if="breakdown.length" class="period-record-card__breakdown" :aria-label="breakdownLabel">
      <span v-for="item in breakdown" :key="item.id">{{ item.icon ?? '·' }} {{ item.label }} · {{ item.count }}</span>
    </div>
    <ul class="period-record-preview">
      <li v-for="item in visibleItems" :key="item.id">
        <span>{{ item.icon }}</span>
        <div>
          {{ item.title }}<small>{{ item.dateLabel }}</small>
        </div>
      </li>
    </ul>
    <ArchivePagination v-model:page="page" :page-count="pageCount" :context-label="paginationLabel" />
  </article>
</template>

<style scoped>
.period-record-card {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--period-record-border);
  border-radius: 18px;
  background: var(--period-record-surface);
}
.period-record-card__heading {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.period-record-card__heading h2 {
  display: block;
  margin: 0;
  color: var(--navy);
}
.period-record-card__heading .eyebrow {
  margin-bottom: 3px;
}
.period-record-card__breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.period-record-card__breakdown span {
  padding: 5px 8px;
  border-radius: 999px;
  background: var(--period-record-meta-surface);
  color: var(--period-record-meta-text);
  font-size: 11px;
  font-weight: 750;
}
.period-record-preview {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.period-record-preview li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--period-record-note-border);
  border-radius: 11px;
  background: var(--period-details-surface);
  color: var(--period-record-note-text);
  font-size: 13px;
  line-height: 1.4;
}
.period-record-preview li > span {
  color: var(--period-record-action);
  font-weight: 850;
  text-align: center;
}
.period-record-preview li > div,
.period-record-preview small {
  min-width: 0;
}
.period-record-preview small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 11px;
}
@media (max-width: 720px) {
  .period-record-card {
    padding: 16px;
  }
  .period-record-card__heading {
    align-items: flex-start;
  }
}
</style>
