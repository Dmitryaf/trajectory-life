<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <span class="review-reminder-dot" role="img" :aria-label="label"></span>
</template>

<style scoped>
.review-reminder-dot {
  position: absolute;
  top: -3px;
  right: -6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--review-reminder-dot);
  box-shadow: 0 0 0 2px var(--surface);
}
</style>
