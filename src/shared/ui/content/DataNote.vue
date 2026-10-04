<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(defineProps<{ as?: string | Component }>(), { as: 'p' });
</script>

<template>
  <component :is="as" class="data-note"><slot /></component>
</template>

<style scoped src="./DataNote.css"></style>
