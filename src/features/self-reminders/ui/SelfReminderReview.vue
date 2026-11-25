<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import PeriodDetails from '@/features/reviews/ui/PeriodDetails.vue';
import SelfReminderList from './SelfReminderList.vue';

const store = useAppStore();
</script>

<template>
  <PeriodDetails v-if="store.selfReminders.length" title="Перечитать напоминания">
    <template #default="{ expanded }">
      <div v-if="expanded" class="self-reminder-review">
        <p>Что удавалось соблюдать? Что стало забываться? Что хочется изменить?</p>
        <SelfReminderList :reminders="store.selfReminders" heading="h3" />
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
