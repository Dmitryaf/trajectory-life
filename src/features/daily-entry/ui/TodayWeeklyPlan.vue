<script setup lang="ts">
import { RouterLink } from 'vue-router';
defineProps<{ decision: string; plan: string; period: string; source: string }>();
</script>

<template>
  <section class="today-weekly-plan" aria-label="Текущий план недели">
    <h2>{{ decision ? 'Моё решение' : 'Мой план' }} на {{ period }}</h2>
    <p>{{ decision || plan }}</p>
    <p v-if="decision && plan && decision !== plan">{{ plan }}</p>
    <RouterLink :to="source">Из обзора прошлой недели</RouterLink>
  </section>
</template>

<style scoped>
.today-weekly-plan {
  grid-column: 1 / -1;
  min-width: 0;
  padding: 12px 16px;
  border-inline-start: 3px solid var(--accent-dark);
  background: var(--surface-soft);
  overflow-wrap: anywhere;
}
.today-weekly-plan h2 {
  margin: 0;
  color: var(--navy);
  font-size: 1rem;
}
.today-weekly-plan p {
  margin: 6px 0;
  white-space: pre-wrap;
}
.today-weekly-plan a {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  color: var(--brand-strong);
}
</style>
