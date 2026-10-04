<script setup lang="ts">
defineOptions({ inheritAttrs: false });
</script>

<template>
  <section class="period-empty-guide" v-bind="$attrs"><slot /></section>
</template>

<style scoped>
.period-empty-guide {
  margin-bottom: 18px;
  padding: 18px 20px;
  border: 1px solid var(--empty-guide-border);
  border-radius: 18px;
  background: var(--empty-guide-surface);
  box-shadow: var(--shadow-soft);
}
.period-empty-guide :deep(p) {
  margin: 6px 0 0;
  color: var(--empty-guide-text);
  font-size: 13px;
  line-height: 1.55;
}
.period-empty-guide :deep(.secondary-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
}
</style>
