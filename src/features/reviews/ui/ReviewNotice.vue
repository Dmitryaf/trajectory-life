<script setup lang="ts">
withDefaults(defineProps<{ tag?: 'div' | 'p' | 'section' }>(), { tag: 'div' });
</script>

<template>
  <component :is="tag" class="period-review-note"><slot></slot></component>
</template>

<style scoped>
.period-review-note {
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid var(--line-success);
  border-radius: 14px;
  background: var(--surface-success);
  color: var(--review-notice-text);
  font-size: 13px;
}
.period-review-note :deep(p) {
  margin: 4px 0 0;
}
</style>
