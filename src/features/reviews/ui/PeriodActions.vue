<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
withDefaults(defineProps<{ copying?: boolean }>(), { copying: false });
defineEmits<{ copy: []; download: [] }>();
</script>

<template>
  <div class="period-actions">
    <ActionButton variant="secondary" type="button" :disabled="copying" :aria-busy="copying" @click="$emit('copy')">
      Скопировать текст для нейросети
    </ActionButton>
    <ActionButton variant="secondary" type="button" @click="$emit('download')">Скачать данные</ActionButton>
  </div>
</template>

<style scoped>
.period-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.period-actions .secondary-button {
  padding: 10px 12px;
  font-size: 12px;
}
@media (max-width: 720px) {
  .period-actions {
    width: 100%;
    justify-content: stretch;
  }
  .period-actions .secondary-button {
    flex: 1;
  }
}
</style>
