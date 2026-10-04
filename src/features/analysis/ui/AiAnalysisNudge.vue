<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { RouterLink } from 'vue-router';
import ReviewNudge from '@/shared/ui/content/ReviewNudge.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
defineEmits<{ dismiss: []; prepare: [] }>();
</script>

<template>
  <ReviewNudge tag="aside" class="ai-analysis-nudge" aria-label="Анализ записей во внешней нейросети">
    <div class="ai-analysis-nudge__copy">
      <EyebrowText>Ещё один способ посмотреть на записи</EyebrowText>
      <strong>Подготовить текст для нейросети</strong>
      <p>Приложение только соберёт текст и ничего не отправит само. Сервис выбираете вы.</p>
      <ol aria-label="Как получить разбор">
        <li>Подготовить текст</li>
        <li>Открыть выбранный сервис</li>
        <li>Вставить текст и получить разбор</li>
      </ol>
    </div>
    <div class="ai-analysis-nudge__actions">
      <ActionButton :as="RouterLink" variant="secondary" to="/week#ai-analysis" @click="$emit('prepare')"
        >Подготовить текст для нейросети</ActionButton
      >
      <button class="ai-analysis-nudge__dismiss" type="button" aria-label="Больше не показывать подсказку" @click="$emit('dismiss')">
        Больше не показывать
      </button>
    </div>
  </ReviewNudge>
</template>

<style scoped>
.ai-analysis-nudge__actions {
  display: grid;
  flex: 0 0 min(300px, 38%);
  gap: 8px;
}
.ai-analysis-nudge__dismiss {
  border: 0;
  background: transparent;
}

@media (max-width: 720px) {
  .ai-analysis-nudge {
    gap: 16px;
  }
  .ai-analysis-nudge__copy ol {
    display: grid;
  }
  .ai-analysis-nudge__actions {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }
  .ai-analysis-nudge .secondary-button {
    width: 100%;
    min-width: 0;
    text-align: center;
    white-space: normal;
  }
}
</style>
