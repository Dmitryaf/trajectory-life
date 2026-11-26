<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppStore } from '@/stores/app';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import ReminderReadingList from './ReminderReadingList.vue';

const store = useAppStore();
const principles = computed(() => store.selfReminders.filter((reminder) => reminder.category === 'principle'));
</script>

<template>
  <div class="today-workspace">
    <PageShell class="page--today"><slot :has-principles="principles.length > 0" /></PageShell>
    <aside v-if="principles.length" class="today-principles" aria-labelledby="today-principles-heading">
      <h2 id="today-principles-heading">Мои принципы</h2>
      <ReminderReadingList :reminders="principles" class="today-principles__list" compact />
      <RouterLink to="/self-reminders#principle">Все принципы</RouterLink>
    </aside>
  </div>
</template>

<style scoped>
.today-principles {
  display: none;
}
@media (min-width: 1280px) {
  .today-workspace:has(> .today-principles) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    align-items: start;
    gap: 24px;
  }
  .today-principles {
    position: sticky;
    top: calc(72px + var(--safe-top));
    display: grid;
    max-height: calc(100dvh - 116px - var(--safe-top) - var(--safe-bottom));
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    font-size: 0.875rem;
  }
  .today-principles h2 {
    margin: 0;
    font-size: 1.125rem;
  }
  .today-principles__list {
    min-height: 0;
    padding: 2px 4px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
  .today-principles a {
    display: flex;
    min-height: 44px;
    align-items: center;
    color: var(--brand-strong);
    font-weight: 650;
    text-underline-offset: 0.15em;
  }
}
</style>
