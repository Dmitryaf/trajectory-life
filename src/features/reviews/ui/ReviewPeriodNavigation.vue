<script setup lang="ts">
import { RouterLink } from 'vue-router';
import RangeTabs from '@/shared/ui/navigation/RangeTabs.vue';
import { reviewPath, type ReviewPeriod } from '../periods';

defineProps<{ period: ReviewPeriod; anchor: string }>();
</script>

<template>
  <RangeTabs as="nav" class="review-period-navigation" aria-label="Период обзора">
    <RouterLink
      :to="reviewPath('week', anchor)"
      :class="{ active: period === 'week' }"
      :aria-current="period === 'week' ? 'page' : undefined"
      aria-label="Неделя"
    >
      <span>Неделя</span>
    </RouterLink>
    <RouterLink
      :to="reviewPath('month', anchor)"
      :class="{ active: period === 'month' }"
      :aria-current="period === 'month' ? 'page' : undefined"
      aria-label="Месяц"
    >
      <span>Месяц</span>
    </RouterLink>
  </RangeTabs>
</template>

<style scoped>
.review-period-navigation {
  width: min(300px, 100%);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0 auto 12px;
}
.review-period-navigation a {
  min-height: 42px;
  display: grid;
  place-items: center;
  text-align: center;
}
</style>
