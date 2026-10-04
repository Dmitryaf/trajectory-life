<script setup lang="ts">
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ tag?: 'aside' | 'section' | 'div' }>(), { tag: 'div' });
</script>

<template>
  <component :is="tag" class="review-nudge" v-bind="$attrs"><slot /></component>
</template>

<style scoped>
.review-nudge {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  padding: 16px 18px;
  border: 1px solid var(--review-nudge-border);
  border-radius: 18px;
  background: var(--review-nudge-surface);
}
.review-nudge :deep(.secondary-button) {
  text-decoration: none;
  white-space: nowrap;
}
.review-nudge :deep(strong) {
  display: block;
  color: var(--review-nudge-title);
}
.review-nudge :deep(p) {
  margin: 3px 0 0;
  color: var(--review-nudge-text);
  font-size: 13px;
}
@media (max-width: 720px) {
  .review-nudge {
    align-items: stretch;
    flex-direction: column;
    padding: 15px;
  }
}
</style>
