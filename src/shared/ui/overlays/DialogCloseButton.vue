<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const button = ref<HTMLButtonElement>();

defineExpose({
  focus: () => button.value?.focus(),
});
</script>

<template>
  <button ref="button" class="dialog-close-button" type="button" :disabled="disabled" :aria-label="label">
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.8"
    >
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  </button>
</template>

<style scoped>
.dialog-close-button {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-soft);
  color: var(--dialog-close-text);
  cursor: pointer;
}
.dialog-close-button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}
</style>
