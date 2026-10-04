<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    rows?: number;
    maxLength?: number;
    placeholder?: string;
    readOnly?: boolean;
  }>(),
  {
    rows: 3,
    maxLength: 2000,
    placeholder: '',
    readOnly: false,
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const field = ref<HTMLTextAreaElement>();
const maxHeight = 320;

function resize() {
  const element = field.value;
  if (!element) {
    return;
  }
  element.style.height = 'auto';
  const height = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${height}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function update(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
  resize();
}

watch(
  () => props.modelValue,
  () => nextTick(resize),
);
onMounted(resize);
</script>

<template>
  <textarea
    ref="field"
    class="auto-grow-textarea"
    :value="modelValue"
    :rows="rows"
    :maxlength="maxLength"
    :placeholder="placeholder"
    :readonly="readOnly"
    @input="update"
  ></textarea>
</template>

<style scoped>
.auto-grow-textarea {
  overflow-y: hidden;
  resize: none;
}
</style>
