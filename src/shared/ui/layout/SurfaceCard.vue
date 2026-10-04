<script setup lang="ts">
import type { Component } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string | Component;
    kind?: 'form' | 'dashboard' | 'review';
  }>(),
  {
    as: 'article',
    kind: 'dashboard',
  },
);
</script>

<template>
  <component :is="props.as" :class="`${props.kind}-card`"><slot /></component>
</template>

<style scoped src="./SurfaceCard.css"></style>
