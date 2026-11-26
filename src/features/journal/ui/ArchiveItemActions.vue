<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <details class="archive-item-actions">
    <summary :aria-label="`Действия с записью «${title}»`">Действия</summary>
    <div><slot></slot></div>
  </details>
</template>

<style scoped>
.archive-item-actions {
  grid-column: 2 / -1;
  justify-self: start;
}
.archive-item-actions summary {
  width: fit-content;
  display: list-item;
  min-height: 44px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--brand-strong);
  background: var(--surface-soft);
  font-weight: 650;
  cursor: pointer;
}
.archive-item-actions summary:hover {
  background: var(--action-secondary-hover-surface);
}
.archive-item-actions div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
</style>
