<script setup lang="ts">
withDefaults(defineProps<{ tag?: 'span' | 'p' }>(), { tag: 'span' });
</script>

<template>
  <component :is="tag" class="eyebrow"><slot /></component>
</template>

<style scoped>
.eyebrow {
  display: block;
  margin-bottom: 9px;
  color: var(--accent-dark);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
</style>
