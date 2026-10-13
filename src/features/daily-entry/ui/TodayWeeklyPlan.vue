<script setup lang="ts">
import { RouterLink } from 'vue-router';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
defineProps<{ plan: string; period: string; source: string }>();
</script>

<template>
  <section class="today-pulse" aria-label="Текущий план недели">
    <div>
      <EyebrowText>План на {{ period }}</EyebrowText>
      <p>{{ plan }}</p>
      <RouterLink :to="source">Из обзора прошлой недели</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.eyebrow {
  margin-bottom: 5px;
}
p {
  margin: 0 0 8px;
  color: var(--today-pulse-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}
a {
  color: var(--brand-strong);
  font-size: 13px;
}
</style>
