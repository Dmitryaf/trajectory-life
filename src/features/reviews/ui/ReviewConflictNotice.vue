<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';

defineProps<{ saving: boolean }>();
defineEmits<{ reload: []; replace: [] }>();
</script>

<template>
  <div role="status" class="review-conflict">
    <p>Обзор изменился на другом устройстве. Ваш текст остался в форме. Выберите, какую версию сохранить.</p>
    <div class="review-conflict__actions">
      <ActionButton variant="secondary" :disabled="saving" @click="$emit('reload')">Загрузить новую версию</ActionButton>
      <ActionButton variant="secondary" :disabled="saving" @click="$emit('replace')">Сохранить мой вариант</ActionButton>
    </div>
  </div>
</template>

<style scoped>
.review-conflict {
  margin-block: 16px;
}

.review-conflict__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
