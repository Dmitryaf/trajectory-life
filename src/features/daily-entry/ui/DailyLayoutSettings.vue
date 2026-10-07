<script setup lang="ts">
import { RouterLink } from 'vue-router';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
</script>

<template>
  <ActionButton :as="RouterLink" variant="secondary" class="daily-layout-settings" to="/settings#daily-blocks">
    Настроить главную <UiIcon name="arrow-right" />
  </ActionButton>
</template>

<style scoped>
.daily-layout-settings {
  grid-column: 2;
  grid-row: 2;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 9px 10px;
  border-radius: 12px;
  box-shadow: none;
  font-size: 13px;
  line-height: 1.2;
}
.daily-layout-settings :deep(.ui-icon) {
  font-size: 16px;
}
@media (max-width: 720px) {
  .daily-layout-settings {
    grid-row: 1;
  }
}
@media (max-width: 359px) {
  .daily-layout-settings {
    grid-column: 1;
    grid-row: 2;
  }
}
</style>
