<template>
  <details class="form-disclosure">
    <summary><slot name="summary" /></summary>
    <div class="form-disclosure__content"><slot /></div>
  </details>
</template>

<style scoped>
.form-disclosure {
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--period-details-surface);
}
.form-disclosure summary {
  cursor: pointer;
  padding: 13px 14px;
  color: var(--form-disclosure-text);
  font-size: 13px;
  font-weight: 800;
}
.form-disclosure__content {
  padding: 2px 14px 14px;
}
.form-disclosure__content > :deep(p:first-child) {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 13px;
}
</style>
