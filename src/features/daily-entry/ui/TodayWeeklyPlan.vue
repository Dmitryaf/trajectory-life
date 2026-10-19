<script setup lang="ts">
import { RouterLink } from 'vue-router';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
defineProps<{ plan: string; period: string; source: string }>();
</script>

<template>
  <section class="today-weekly-plan" aria-label="Текущий план недели">
    <details>
      <summary><span>Мой план на неделю</span><UiIcon name="arrow-down" /></summary>
      <EyebrowText>План на {{ period }}</EyebrowText>
      <p>{{ plan }}</p>
      <RouterLink :to="source">Из обзора прошлой недели</RouterLink>
    </details>
  </section>
</template>

<style scoped>
.today-weekly-plan {
  grid-column: 1 / -1;
  min-width: 0;
  padding: 0 4px;
}
summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  color: var(--muted);
  cursor: pointer;
  list-style: none;
  font-size: 13px;
}
summary::-webkit-details-marker {
  display: none;
}
details[open] summary {
  margin-bottom: 10px;
}
details[open] summary :deep(.ui-icon) {
  transform: rotate(180deg);
}
.eyebrow {
  margin-bottom: 5px;
}
p {
  margin: 0 0 8px;
  color: var(--today-pulse-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}
a {
  color: var(--brand-strong);
  font-size: 13px;
}
</style>
