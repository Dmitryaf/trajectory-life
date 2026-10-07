<script setup lang="ts">
import { ref } from 'vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import type { UiIconName } from '@/shared/ui/icons/icons';

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ icon: UiIconName; variant?: 'feedback' | 'help' | 'inline' }>(), { variant: 'feedback' });

const element = ref<HTMLButtonElement>();
defineExpose({ element });
</script>

<template>
  <button ref="element" class="utility-trigger" :class="`utility-trigger--${variant}`" type="button" v-bind="$attrs">
    <span><UiIcon :name="icon" /></span>
    <strong><slot /></strong>
  </button>
</template>

<style scoped>
.utility-trigger {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border: 1px solid var(--utility-action-border);
  border-radius: 999px;
  background: var(--utility-action-surface);
  color: var(--utility-action-text);
  box-shadow: 0 12px 30px var(--utility-action-shadow);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform var(--motion-fast),
    border-color var(--motion-fast),
    box-shadow var(--motion-fast);
}
.utility-trigger span {
  color: var(--accent-dark);
  font-size: 15px;
}
.utility-trigger strong {
  font-weight: 850;
}
.utility-trigger--help,
.utility-trigger--feedback {
  width: 38px;
  min-height: 38px;
  flex-shrink: 0;
  justify-content: center;
  padding: 0;
}
.utility-trigger--help strong,
.utility-trigger--feedback strong {
  display: none;
}
.utility-trigger--inline {
  width: auto;
  min-height: 42px;
  justify-content: center;
  padding: 9px 13px;
  background: var(--surface);
}
.utility-trigger:hover {
  border-color: var(--utility-action-hover-border);
  box-shadow: 0 15px 34px var(--utility-action-hover-shadow);
  transform: translateY(-2px);
}
@media (max-width: 720px) {
  .utility-trigger--help,
  .utility-trigger--feedback {
    width: 36px;
    min-height: 36px;
  }
}
</style>
