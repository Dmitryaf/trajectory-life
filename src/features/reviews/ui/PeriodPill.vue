<template>
  <span class="period-pill"><slot></slot></span>
</template>

<style scoped>
.period-pill {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 7px 11px;
  border: 1px solid var(--period-pill-border);
  border-radius: 999px;
  background: var(--period-pill-surface);
  color: var(--period-pill-text);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
</style>
