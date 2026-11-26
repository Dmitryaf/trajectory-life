<script setup lang="ts">
import { RouterLink } from 'vue-router';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import CountBadge from '@/shared/ui/data-display/CountBadge.vue';
import { formatDate } from '@/services/dates';
import type { monthWeekSummariesForPeriod } from '../monthWeeks';
import { reviewPath } from '../periods';
import ReviewNotice from './ReviewNotice.vue';

defineProps<{ weeks: ReturnType<typeof monthWeekSummariesForPeriod>; coveredDays: number }>();
</script>

<template>
  <SurfaceCard kind="dashboard" class="month-week-overview">
    <SectionHeading>
      <h2>Сравнение недель</h2>
      <CountBadge>{{ coveredDays }} дн.</CountBadge>
    </SectionHeading>
    <div v-if="weeks.length >= 2" class="month-week-story">
      <article v-for="week in weeks" :key="week.rangeStart">
        <RouterLink :to="reviewPath('week', week.rangeStart)">
          {{ formatDate(week.rangeStart, { day: 'numeric', month: 'short' }) }}–{{
            formatDate(week.rangeEnd, { day: 'numeric', month: 'short' })
          }}
        </RouterLink>
        <span>{{ week.summary.coveredEntriesCount }} дн. с записями</span>
        <span v-if="week.resultsCount">Итогов: {{ week.resultsCount }}</span>
        <span v-if="week.eventsCount">Событий: {{ week.eventsCount }}</span>
        <span v-if="week.summary.specialDays">Особых дней: {{ week.summary.specialDays }}</span>
      </article>
    </div>
    <ReviewNotice v-else>
      <strong>Для сравнения нужны записи хотя бы за две недели</strong>
      <p>Сейчас данные есть только в одной части месяца. Подробности уже доступны ниже.</p>
      <RouterLink v-if="weeks[0]" :to="reviewPath('week', weeks[0].rangeStart)">Открыть неделю с записями</RouterLink>
    </ReviewNotice>
  </SurfaceCard>
</template>

<style scoped>
.month-week-story {
  display: grid;
  gap: 10px;
}
.month-week-story article {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 12px 14px;
  border: 1px solid var(--month-summary-item-border);
  border-radius: 14px;
  background: var(--weekly-rhythm-item-surface);
}
.month-week-story a {
  display: inline-flex;
  align-items: center;
  min-width: 112px;
  min-height: 44px;
  color: var(--brand-strong);
  font-weight: 700;
  text-underline-offset: 3px;
}
.month-week-story span {
  color: var(--muted);
  font-size: 13px;
}
</style>
