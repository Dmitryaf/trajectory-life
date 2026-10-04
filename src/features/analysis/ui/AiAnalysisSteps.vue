<script setup lang="ts">
import DataNote from '@/shared/ui/content/DataNote.vue';
</script>

<template>
  <DataNote as="div" class="ai-analysis-steps">
    <p><strong>Текст остаётся у вас:</strong> приложение ничего не отправляет и не выбирает внешний сервис.</p>
    <ol>
      <li>Подготовьте текст</li>
      <li>Откройте выбранную нейросеть</li>
      <li>Вставьте текст и получите разбор</li>
    </ol>
  </DataNote>
</template>

<style scoped>
.ai-analysis-steps p {
  margin-bottom: 6px;
}
.ai-analysis-steps ol {
  display: grid;
  gap: 3px;
  margin: 0;
  padding-left: 20px;
}
.ai-analysis-steps li {
  padding-left: 2px;
}
</style>
