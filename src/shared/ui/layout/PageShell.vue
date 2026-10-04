<script setup lang="ts">
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ tag?: 'section' | 'main' | 'div' }>(), { tag: 'section' });
</script>

<template>
  <component :is="tag" class="page" v-bind="$attrs"><slot /></component>
</template>

<style scoped>
.page {
  min-width: 0;
  animation: page-in 0.25s ease-out;
}
@keyframes page-in {
  from {
    opacity: 0;
  }
}
</style>
