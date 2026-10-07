<script setup lang="ts">
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';

defineProps<{ modelValue: boolean | null }>();
defineEmits<{ 'update:modelValue': [value: boolean | null] }>();
const options = [
  { value: true, label: 'Да' },
  { value: false, label: 'Нет' },
  { value: null, label: 'Нет отметки' },
];
</script>

<template>
  <FormFieldLabel tag="span">Сегодня получилось это сделать?</FormFieldLabel>
  <div class="binary-choice" role="group" aria-label="Сегодня получилось это сделать?">
    <button
      v-for="option in options"
      :key="option.label"
      type="button"
      :class="{ selected: modelValue === option.value }"
      :aria-pressed="modelValue === option.value"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.binary-choice {
  display: flex;
  gap: 8px;
}
.binary-choice button {
  padding: 10px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  cursor: pointer;
}
.binary-choice button.selected {
  border-color: var(--navy);
  background: var(--navy);
  color: var(--text-inverse);
}
</style>
