<script setup lang="ts">
import { RouterLink } from 'vue-router';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
</script>

<template>
  <RouterLink class="daily-layout-settings" to="/settings#daily-blocks" aria-label="Настроить главную">
    <UiIcon name="settings" /> Настроить
  </RouterLink>
</template>

<style scoped>
.daily-layout-settings {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 6px 2px;
  color: var(--muted);
  text-decoration: none;
  font-size: 12px;
  line-height: 1.2;
}
.daily-layout-settings :deep(.ui-icon) {
  font-size: 16px;
}
</style>
