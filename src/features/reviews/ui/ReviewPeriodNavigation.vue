<script setup lang="ts">
import { RouterLink } from 'vue-router';
import RangeTabs from '@/shared/ui/navigation/RangeTabs.vue';

defineProps<{ period: 'week' | 'month' }>();
</script>

<template>
  <RangeTabs as="nav" class="review-period-navigation" aria-label="Период обзора">
    <RouterLink to="/week" :class="{ active: period === 'week' }" :aria-current="period === 'week' ? 'page' : undefined">
      Неделя
    </RouterLink>
    <RouterLink to="/month" :class="{ active: period === 'month' }" :aria-current="period === 'month' ? 'page' : undefined">
      Месяц
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
