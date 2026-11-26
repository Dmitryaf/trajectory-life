<script setup lang="ts">
import { computed } from 'vue';
import ReminderReadingList from './ReminderReadingList.vue';
import { selfReminderCategories, type SelfReminder } from '@/model/selfReminder';

const props = withDefaults(
  defineProps<{ reminders: readonly SelfReminder[]; heading?: 'h2' | 'h3'; editable?: boolean; selectedId?: string }>(),
  { heading: 'h2', selectedId: undefined },
);
const groups = computed(() => {
  return selfReminderCategories
    .map((category) => ({ ...category, reminders: props.reminders.filter((reminder) => reminder.category === category.value) }))
    .filter((group) => group.reminders.length);
});
</script>

<template>
  <div class="self-reminder-list">
    <section v-for="group in groups" :id="group.value" :key="group.value">
      <component :is="heading">{{ group.label }}</component>
      <ReminderReadingList :reminders="group.reminders" compact :editable="editable" :selected-id="selectedId">
        <template #actions="{ reminder }"><slot name="actions" :reminder="reminder" /></template>
      </ReminderReadingList>
    </section>
  </div>
</template>

<style scoped>
.self-reminder-list {
  display: grid;
  gap: 16px;
}
.self-reminder-list h2,
.self-reminder-list h3 {
  margin: 0 0 4px;
  color: var(--navy);
  font-size: 1rem;
}
</style>
