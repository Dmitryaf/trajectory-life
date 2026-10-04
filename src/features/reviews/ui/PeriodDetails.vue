<script setup lang="ts">
defineProps<{ title: string; open?: boolean }>();
defineEmits<{ toggle: [event: Event] }>();
</script>

<template>
  <details class="period-details" :open="open" @toggle="$emit('toggle', $event)">
    <summary>{{ title }}</summary>
    <div class="period-details__content"><slot></slot></div>
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
