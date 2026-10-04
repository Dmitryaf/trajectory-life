<script setup lang="ts">
import { computed } from 'vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';

const props = defineProps<{ mode: 'hide' | 'restore'; label: string; disabled?: boolean }>();
defineEmits<{ click: [] }>();

const accessibleLabel = computed(() =>
  props.mode === 'hide' ? `Убрать ${props.label} из ежедневной записи` : `Вернуть ${props.label} в ежедневную запись`,
);
</script>

<template>
  <button
    :class="mode === 'hide' ? 'hide-option-button' : 'restore-option'"
    type="button"
    :aria-label="accessibleLabel"
    :title="mode === 'hide' ? 'Убрать из ежедневной записи' : undefined"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <UiIcon :name="mode === 'hide' ? 'delete' : 'add'" />
    <span v-if="mode === 'restore'">{{ label }}</span>
  </button>
</template>

<style scoped>
.restore-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 11px;
  border: 1px dashed var(--settings-view-control-border);
  border-radius: 999px;
  background: var(--settings-view-control-surface);
  color: var(--settings-view-control-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 750;
}
.restore-option:hover {
  border-color: var(--settings-view-control-active-border);
  background: var(--settings-view-control-active-surface);
  color: var(--settings-view-control-active-text);
}
.restore-option :deep(.ui-icon) {
  color: var(--settings-view-action);
  font-size: 15px;
}
.hide-option-button {
  width: 28px;
  height: 28px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--settings-view-option-border);
  border-radius: 9px;
  background: var(--settings-view-option-surface);
  color: var(--settings-view-option-text);
  cursor: pointer;
  font-size: 15px;
  transition:
    border-color var(--motion-fast),
    background-color var(--motion-fast),
    color var(--motion-fast);
}
.hide-option-button:hover {
  border-color: var(--settings-view-option-active-border);
  background: var(--settings-view-option-active-surface);
  color: var(--settings-view-option-active-text);
}
</style>
