<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import AiAnalysisSteps from './AiAnalysisSteps.vue';
import SettingsCard from '@/features/settings/ui/SettingsCard.vue';
import FormCardHeading from '@/shared/ui/forms/FormCardHeading.vue';
import DateInput from '@/shared/ui/forms/DateInput.vue';
import FormDisclosure from '@/shared/ui/forms/FormDisclosure.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import FormRow from '@/shared/ui/forms/FormRow.vue';
import { useExternalAnalysis } from '../useExternalAnalysis';

const { copyCustomPrompt, copyPrompt, downloadCustomData, downloadData, end, isCopying, maxDate, start } = useExternalAnalysis();
</script>

<template>
  <SettingsCard id="analysis-settings" class="settings-card--analysis" tone="purple">
    <FormCardHeading icon="goal" tone="green">
      <div>
        <h2>Данные для разбора в нейросети</h2>
        <p>
          Скопируйте текст с записями или скачайте данные за выбранные даты в файле JSON. Передать их в нейросеть можно самостоятельно.
          Приложение ничего не отправляет.
        </p>
      </div>
    </FormCardHeading>
    <AiAnalysisSteps />
    <div class="ai-actions">
      <ActionButton
        variant="secondary"
        type="button"
        :disabled="isCopying('analysis-week')"
        :aria-busy="isCopying('analysis-week')"
        @click="copyPrompt('week')"
      >
        Скопировать текст недели
      </ActionButton>
      <ActionButton
        variant="secondary"
        type="button"
        :disabled="isCopying('analysis-month')"
        :aria-busy="isCopying('analysis-month')"
        @click="copyPrompt('month')"
      >
        Скопировать текст месяца
      </ActionButton>
      <ActionButton variant="secondary" type="button" @click="downloadData('week')">Скачать данные недели</ActionButton>
      <ActionButton variant="secondary" type="button" @click="downloadData('month')">Скачать данные месяца</ActionButton>
    </div>
    <FormDisclosure class="analysis-range">
      <template #summary>Выбрать другой период</template>
      <p>Например, можно захватить часть прошлого месяца и несколько дней текущего.</p>
      <FormRow>
        <div>
          <FormFieldLabel for="analysis-start">Начало периода</FormFieldLabel>
          <DateInput id="analysis-start" v-model="start" :max="end" aria-label="Начало периода анализа" />
        </div>
        <div>
          <FormFieldLabel for="analysis-end">Конец периода</FormFieldLabel>
          <DateInput id="analysis-end" v-model="end" :min="start" :max="maxDate" aria-label="Конец периода анализа" />
        </div>
      </FormRow>
      <div class="ai-actions">
        <ActionButton
          variant="secondary"
          type="button"
          :disabled="isCopying('analysis-range')"
          :aria-busy="isCopying('analysis-range')"
          @click="copyCustomPrompt"
        >
          Скопировать текст периода
        </ActionButton>
        <ActionButton variant="secondary" type="button" @click="downloadCustomData">Скачать данные периода</ActionButton>
      </div>
      <DataNote>
        В текст входят записи по каждому дню выбранного периода, включая личные заметки. JSON содержит данные выбранного периода и не
        заменяет резервную копию.
      </DataNote>
    </FormDisclosure>
    <DataNote> В текст и файл входят личные заметки за выбранные даты. Просмотрите их перед передачей в нейросеть. </DataNote>
  </SettingsCard>
</template>

<style scoped>
.ai-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 12px;
}

@media (max-width: 720px) {
  .ai-actions {
    grid-template-columns: 1fr;
  }
}
</style>
