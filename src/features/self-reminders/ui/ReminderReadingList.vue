<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import type { SelfReminder } from '@/model/selfReminder';

const props = defineProps<{ reminders: readonly SelfReminder[]; compact?: boolean; editable?: boolean; selectedId?: string }>();

function shortText(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.length > 100 ? `${firstLine.slice(0, 100).trimEnd()}…` : firstLine;
}

const rows = computed(() =>
  [...props.reminders]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((reminder) => {
      const label = reminder.title || shortText(reminder.text);
      return { reminder, label, expandable: props.editable || (label !== reminder.text && (props.compact || Boolean(reminder.title))) };
    }),
);
watch(
  () => (props.selectedId && rows.value.some(({ reminder }) => reminder.id === props.selectedId) ? props.selectedId : undefined),
  async (id) => {
    if (!id) {
      return;
    }
    await nextTick();
    const summary = document.getElementById(`reminder-entry-${id}`)?.querySelector('summary');
    summary?.focus({ preventScroll: true });
    summary?.scrollIntoView({ block: 'nearest' });
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <ul class="reminder-reading-list">
    <li v-for="{ reminder, label, expandable } in rows" :id="editable ? `reminder-entry-${reminder.id}` : undefined" :key="reminder.id">
      <details v-if="expandable" :open="selectedId === reminder.id">
        <summary>{{ label }}</summary>
        <p v-if="label !== reminder.text">{{ reminder.text }}</p>
        <slot name="actions" :reminder="reminder" />
      </details>
      <p v-else>{{ reminder.text }}</p>
    </li>
  </ul>
</template>

<style scoped>
.reminder-reading-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.reminder-reading-list li + li {
  border-top: 1px solid var(--line-soft);
}
.reminder-reading-list summary,
.reminder-reading-list p {
  margin: 0;
  overflow-wrap: anywhere;
}
.reminder-reading-list summary {
  min-height: 44px;
  padding: 10px 6px;
  border-radius: 6px;
  color: var(--brand-strong);
  font-weight: 650;
  cursor: pointer;
}
.reminder-reading-list summary:hover {
  background: var(--surface-soft);
}
.reminder-reading-list p {
  padding: 8px 6px;
  color: var(--text);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
