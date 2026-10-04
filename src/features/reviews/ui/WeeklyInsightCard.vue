<script setup lang="ts">
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
</script>

<template>
  <article class="insight-card">
    <span class="insight-card__mark"><UiIcon name="context" /></span>
    <p><slot /></p>
  </article>
</template>

<style scoped>
.insight-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
  padding: 18px 20px;
  border: 1px solid var(--week-prompt-border);
  border-radius: 18px;
  background: linear-gradient(135deg, var(--week-prompt-surface-start), var(--week-prompt-surface-end));
  box-shadow: 0 8px 22px var(--week-prompt-shadow);
}
.insight-card__mark {
  color: var(--week-prompt-action);
  font-size: 22px;
}
.insight-card p {
  margin: 0;
  color: var(--week-prompt-text);
}
</style>
