<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(defineProps<{ as?: string | Component }>(), { as: 'div' });
</script>

<template>
  <component :is="as" class="range-tabs"><slot /></component>
</template>

<style scoped src="./RangeTabs.css"></style>
