<script setup lang="ts">
import { computed } from 'vue';
import type { UiIconName } from './icons';

const props = defineProps<{ name: UiIconName }>();
const href = computed(() => `/icons/ui-icons.svg#${props.name}`);
</script>

<template>
  <svg class="ui-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <use :href="href" />
  </svg>
</template>

<style scoped>
.ui-icon {
  width: 1em;
  height: 1em;
  display: block;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
