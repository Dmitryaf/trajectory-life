<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';
import PeriodDetails from '@/features/reviews/ui/PeriodDetails.vue';
import ReminderReadingList from './ReminderReadingList.vue';
import SelfReminderList from './SelfReminderList.vue';

const store = useAppStore();
const questions = computed(() => store.selfReminders.filter((reminder) => reminder.category === 'question'));
const notes = computed(() => store.selfReminders.filter((reminder) => reminder.category !== 'question'));
</script>

<template>
  <PeriodDetails v-if="questions.length" title="Вопросы месяца">
    <template #default="{ expanded }">
      <ReminderReadingList v-if="expanded" :reminders="questions" class="self-reminder-review" />
    </template>
  </PeriodDetails>
  <PeriodDetails v-if="notes.length" title="Перечитать напоминания">
    <template #default="{ expanded }">
      <div v-if="expanded" class="self-reminder-review">
        <p>Что удавалось соблюдать? Что стало забываться? Что хочется изменить?</p>
        <SelfReminderList :reminders="notes" heading="h3" />
      </div>
    </template>
  </PeriodDetails>
</template>

<style scoped>
.self-reminder-review {
  padding-bottom: 10px;
}
.self-reminder-review > p {
  margin: 0 0 16px;
  color: var(--muted);
}
</style>
