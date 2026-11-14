<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { DailyEntry } from '@/types';
import { formatDate } from '@/services/dates';
import { pageCount, pageItems } from '@/services/pagination';
import ArchivePagination from '@/features/journal/ui/ArchivePagination.vue';
import ClampedText from '@/shared/ui/content/ClampedText.vue';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
const props = defineProps<{ entries: DailyEntry[] }>();
const notes = computed(() => props.entries.filter((entry) => entry.importantFact.trim()).sort((a, b) => b.date.localeCompare(a.date)));
const page = ref(1);
const pages = computed(() => pageCount(notes.value.length, 7));
const visible = computed(() => pageItems(notes.value, page.value, 7));
watch(
  () => props.entries,
  () => {
    page.value = 1;
  },
);
</script>
<template>
  <SurfaceCard v-if="notes.length" kind="dashboard" class="month-daily-notes">
    <SectionHeading
      ><div>
        <h2>Что хочется запомнить</h2>
        <p>Ваши записи по дням</p>
      </div></SectionHeading
    >
    <article v-for="entry in visible" :key="entry.date" class="month-daily-notes__entry">
      <RouterLink
        :to="`/today?date=${entry.date}`"
        :aria-label="`Открыть запись за ${formatDate(entry.date, { day: 'numeric', month: 'long', year: 'numeric' })}`"
      >
        {{ formatDate(entry.date, { day: 'numeric', month: 'long' }) }}
      </RouterLink>
      <ClampedText :text="entry.importantFact" :content-id="`month-daily-${entry.date}`" />
    </article>
    <ArchivePagination v-model:page="page" :page-count="pages" context-label="дневных заметок месяца" />
  </SurfaceCard>
</template>
<style scoped>
.month-daily-notes__entry {
  padding-block: 12px;
  border-top: 1px solid var(--period-record-border);
  overflow-wrap: anywhere;
}
.month-daily-notes__entry a {
  color: var(--brand-strong);
  font-weight: 700;
}
.month-daily-notes__entry :deep(p) {
  white-space: pre-wrap;
}
</style>
