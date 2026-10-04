<script setup lang="ts">
import { nextTick, ref } from 'vue';

defineOptions({ inheritAttrs: false });
const props = defineProps<{ displayValue?: string }>();
const model = defineModel<string>();
const element = ref<HTMLInputElement>();
defineExpose({ element });

function updateModel(event: Event) {
  model.value = (event.target as HTMLInputElement).value;
}

async function restoreControlledValue() {
  await nextTick();
  const expected = props.displayValue ?? model.value ?? '';
  if (element.value && element.value.value !== expected) {
    element.value.value = expected;
  }
}
</script>

<template>
  <input
    ref="element"
    :value="props.displayValue ?? model"
    class="date-input"
    type="date"
    v-bind="$attrs"
    @input="updateModel"
    @change="restoreControlledValue"
  />
</template>

<style scoped>
.date-input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  background: var(--period-details-surface);
  font-weight: 650;
}

@media (max-width: 720px) {
  .date-input {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    inline-size: 100% !important;
    min-inline-size: 0 !important;
    max-inline-size: 100% !important;
    appearance: none;
    -webkit-appearance: none;
  }
}
</style>
