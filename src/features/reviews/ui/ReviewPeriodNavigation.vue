<script setup lang="ts">
import { RouterLink } from 'vue-router';
import RangeTabs from '@/shared/ui/navigation/RangeTabs.vue';
import { useReviewReminders } from '../useReviewReminders';
import ReviewReminderDot from './ReviewReminderDot.vue';

defineProps<{ period: 'week' | 'month' }>();
const context = useReviewReminders();
</script>

<template>
  <RangeTabs as="nav" class="review-period-navigation" aria-label="Период обзора">
    <RouterLink
      to="/week"
      :class="{ active: period === 'week' }"
      :aria-current="period === 'week' ? 'page' : undefined"
      aria-label="Неделя"
      :aria-describedby="context?.reminders.value.some((item) => item.period === 'week') ? 'week-review-reminder' : undefined"
    >
      <span
        >Неделя<ReviewReminderDot
          v-if="context?.reminders.value.some((item) => item.period === 'week')"
          id="week-review-reminder"
          label="Можно вспомнить неделю"
      /></span>
    </RouterLink>
    <RouterLink
      to="/month"
      :class="{ active: period === 'month' }"
      :aria-current="period === 'month' ? 'page' : undefined"
      aria-label="Месяц"
      :aria-describedby="context?.reminders.value.some((item) => item.period === 'month') ? 'month-review-reminder' : undefined"
    >
      <span
        >Месяц<ReviewReminderDot
          v-if="context?.reminders.value.some((item) => item.period === 'month')"
          id="month-review-reminder"
          label="Можно вспомнить месяц"
      /></span>
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
.review-period-navigation a > span {
  position: relative;
}
</style>
