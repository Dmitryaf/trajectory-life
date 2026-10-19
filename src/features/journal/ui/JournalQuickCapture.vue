<script setup lang="ts">
import { RouterLink } from 'vue-router';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
</script>

<template>
  <nav class="quick-capture" aria-label="Быстрые записи">
    <RouterLink to="/results"
      ><span><UiIcon name="result" /></span><strong>Записать итог</strong></RouterLink
    >
    <RouterLink to="/events" aria-label="Записать мысль или событие"
      ><span><UiIcon name="event" /></span><strong>Мысль или событие</strong></RouterLink
    >
  </nav>
</template>

<style scoped>
.quick-capture {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 16px;
}
.quick-capture a {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--quick-capture-border);
  border-radius: 12px;
  background: var(--quick-capture-surface);
  color: var(--navy);
  text-decoration: none;
  box-shadow: none;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
}
.quick-capture a:hover {
  transform: translateY(-2px);
  box-shadow: none;
}
.quick-capture span {
  width: 20px;
  height: 20px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--more-view-journal-text);
}
.quick-capture strong {
  font-size: 12px;
  line-height: 1.25;
}
</style>
