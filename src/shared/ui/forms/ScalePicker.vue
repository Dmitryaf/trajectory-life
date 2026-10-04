<script setup lang="ts">
defineProps<{ modelValue: number | null; lowLabel: string; highLabel: string }>();
defineEmits<{ 'update:modelValue': [value: number] }>();
</script>

<template>
  <div>
    <div class="scale-picker">
      <button
        v-for="value in 5"
        :key="value"
        type="button"
        class="scale-picker__item"
        :class="{ 'scale-picker__item--selected': modelValue === value }"
        @click="$emit('update:modelValue', value)"
      >
        {{ value }}
      </button>
    </div>
    <div class="scale-picker__labels">
      <span>{{ lowLabel }}</span
      ><span>{{ highLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.scale-picker {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.scale-picker__item {
  height: 42px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--scale-option-surface);
  color: var(--scale-option-text);
  cursor: pointer;
  font-weight: 750;
}
.scale-picker__item--selected {
  border-color: var(--navy-soft);
  background: var(--navy-soft);
  color: var(--text-inverse);
  box-shadow: 0 5px 12px var(--scale-option-shadow);
}
.scale-picker__labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  color: var(--scale-option-muted);
  font-size: 12px;
}
</style>
