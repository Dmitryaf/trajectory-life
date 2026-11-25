<script setup lang="ts">
import { computed } from 'vue';
import { selfReminderCategories, type SelfReminder } from '@/model/selfReminder';

const props = withDefaults(defineProps<{ reminders: readonly SelfReminder[]; heading?: 'h2' | 'h3' }>(), { heading: 'h2' });
const groups = computed(() => {
  const sorted = [...props.reminders].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return selfReminderCategories
    .map((category) => ({ ...category, reminders: sorted.filter((reminder) => reminder.category === category.value) }))
    .filter((group) => group.reminders.length);
});
</script>

<template>
  <div class="self-reminder-list">
    <section v-for="group in groups" :key="group.value">
      <component :is="heading">{{ group.label }}</component>
      <ul>
        <li v-for="reminder in group.reminders" :key="reminder.id">
          <p>{{ reminder.text }}</p>
          <slot name="actions" :reminder="reminder" />
        </li>
      </ul>
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
.self-reminder-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.self-reminder-list li {
  padding-block: 10px;
}
.self-reminder-list li + li {
  border-top: 1px solid var(--line-soft);
}
.self-reminder-list p {
  max-width: 70ch;
  margin: 0;
  color: var(--text);
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
