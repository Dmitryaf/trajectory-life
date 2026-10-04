<script setup lang="ts">
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import type { UiIconName } from '@/shared/ui/icons/icons';

withDefaults(
  defineProps<{
    label: string;
    icon: UiIconName;
    danger?: boolean;
    disabled?: boolean;
  }>(),
  { danger: false, disabled: false },
);

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="icon-action-button"
    :class="{ 'icon-action-button--danger': danger }"
    type="button"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <UiIcon :name="icon" />
  </button>
</template>

<style scoped>
.icon-action-button {
  border: 0;
  background: transparent;
  color: var(--icon-action-muted);
  cursor: pointer;
  font-size: 21px;
}
.icon-action-button--danger:hover {
  color: var(--icon-action-danger);
}
</style>
