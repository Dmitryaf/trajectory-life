<script setup lang="ts">
import { RouterLink } from 'vue-router';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
</script>

<template>
  <nav class="quick-capture" aria-label="Быстрые записи">
    <RouterLink to="/results"
      ><span><UiIcon name="result" /></span><strong>Записать итог</strong></RouterLink
    >
    <RouterLink to="/events"
      ><span><UiIcon name="event" /></span><strong>Записать мысль или событие</strong></RouterLink
    >
  </nav>
</template>

<style scoped>
.quick-capture {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.quick-capture a {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 44px;
  padding: 12px 15px;
  border: 1px solid var(--quick-capture-border);
  border-radius: 18px;
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
.quick-capture a:nth-child(2) span {
  color: var(--more-view-event-text);
  background: var(--archive-event-surface-end);
}
.quick-capture span {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
  background: var(--chip-selected-surface);
  color: var(--more-view-journal-text);
}
.quick-capture strong {
  font-size: 13px;
  line-height: 1.25;
}
@media (max-width: 720px) {
  .quick-capture {
    grid-template-columns: 1fr;
  }
}
</style>
