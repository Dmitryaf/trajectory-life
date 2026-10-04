<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

defineProps<{
  id: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const visible = ref(false);

function updateValue(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="password-field">
    <input :id="id" v-bind="$attrs" :value="modelValue" :type="visible ? 'text' : 'password'" @input="updateValue" />
    <button
      class="password-field__toggle"
      type="button"
      :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'"
      :aria-pressed="visible"
      :aria-controls="id"
      @click="visible = !visible"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.75" />
        <path v-if="visible" d="m4 4 16 16" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.password-field {
  position: relative;
}
.password-field input {
  padding-right: 52px;
}
.password-field__toggle {
  position: absolute;
  top: 50%;
  right: 5px;
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transform: translateY(-50%);
}
.password-field__toggle svg {
  width: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
</style>
