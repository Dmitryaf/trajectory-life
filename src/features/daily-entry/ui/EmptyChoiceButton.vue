<script setup lang="ts">
defineProps<{ selected: boolean }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button class="none-option" :class="{ selected }" :aria-pressed="selected" type="button" @click="$emit('click')"><slot /></button>
</template>

<style scoped>
.none-option {
  margin-top: 9px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--none-option-surface);
  color: var(--none-option-text);
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    color 0.15s;
}
.none-option:hover {
  border-color: var(--chip-border);
  background: var(--surface);
}
.none-option.selected {
  border-color: var(--range-tab-active-border);
  background: var(--range-tab-active-surface);
  color: var(--range-tab-active-text);
}
</style>
