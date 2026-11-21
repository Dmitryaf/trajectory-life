<script setup lang="ts">
defineProps<{ dailyNotes: boolean; weekReviews: boolean }>();
</script>

<template>
  <nav v-if="dailyNotes || weekReviews" class="month-section-links" aria-label="Записи и выводы месяца">
    <a v-if="dailyNotes" href="#month-daily-notes">Записи по дням</a>
    <a v-if="weekReviews" href="#month-week-reviews">Недельные выводы</a>
  </nav>
</template>

<style scoped>
.month-section-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 20px;
  margin: 0 0 16px;
}
.month-section-links > a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--brand-strong);
  font-weight: 700;
  text-underline-offset: 3px;
}
</style>
