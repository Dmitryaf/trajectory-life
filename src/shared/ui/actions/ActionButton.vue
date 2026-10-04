<script setup lang="ts">
import type { Component } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: string | Component;
    variant?: 'primary' | 'secondary' | 'danger';
    busy?: boolean;
    busyLabel?: string;
  }>(),
  {
    as: 'button',
    variant: 'primary',
    busy: false,
    busyLabel: '',
  },
);
</script>

<template>
  <component
    :is="props.as"
    v-bind="$attrs"
    :type="props.as === 'button' ? ($attrs.type ?? 'button') : undefined"
    :class="`${props.variant}-button`"
    :aria-busy="props.busy || $attrs['aria-busy']"
    :disabled="props.as === 'button' ? props.busy || $attrs.disabled : undefined"
  >
    <span v-if="props.busyLabel" class="action-button-labels">
      <span :class="{ 'action-button-label-hidden': props.busy }" :aria-hidden="props.busy"><slot /></span>
      <span :class="{ 'action-button-label-hidden': !props.busy }" :aria-hidden="!props.busy">{{ props.busyLabel }}</span>
    </span>
    <slot v-else />
  </component>
</template>

<style scoped src="./ActionButton.css"></style>
