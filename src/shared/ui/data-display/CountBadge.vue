<template>
  <span class="count-badge"><slot></slot></span>
</template>

<style scoped>
.count-badge {
  min-width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--count-badge-surface);
  color: var(--count-badge-text);
  font-weight: 750;
}
</style>
