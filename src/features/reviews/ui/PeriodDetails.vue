<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ title: string; open?: boolean }>();
const emit = defineEmits<{ toggle: [event: Event] }>();
const expanded = ref(Boolean(props.open));

function toggle(event: Event) {
  expanded.value = (event.currentTarget as HTMLDetailsElement).open;
  emit('toggle', event);
}
</script>

<template>
  <details class="period-details" :open="open" @toggle="toggle">
    <summary>{{ title }}</summary>
    <div class="period-details__content"><slot :expanded="expanded"></slot></div>
  </details>
</template>

<style scoped>
.period-details {
  margin-bottom: 16px;
  border: 1px solid var(--period-details-border);
  border-radius: 16px;
  background: var(--period-details-surface);
}

.period-details > summary {
  padding: 16px 18px;
  color: var(--navy);
  font-weight: 750;
  cursor: pointer;
}

.period-details[open] > summary {
  border-bottom: 1px solid var(--line-soft);
}

.period-details__content {
  padding: 16px 16px 0;
}
</style>
