<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import DateInput from '@/shared/ui/forms/DateInput.vue';
import ChipGroup from '@/shared/ui/forms/ChipGroup.vue';
import SettingsCard from '@/features/settings/ui/SettingsCard.vue';
import FormCardHeading from '@/shared/ui/forms/FormCardHeading.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import FormHint from '@/shared/ui/forms/FormHint.vue';
import FormRow from '@/shared/ui/forms/FormRow.vue';
import type { AppSettings } from '@/types';
import { experimentDecisionOptions, experimentTextLimits } from '../model';

defineProps<{
  canConclude: boolean;
  historyCount: number;
  identityLocked: boolean;
  savedEndDate: string;
  saveLabel: string;
  saving: boolean;
}>();

const experiment = defineModel<AppSettings['experiment']>('experiment', { required: true });

defineEmits<{
  complete: [];
  save: [];
}>();
</script>

<template>
  <SettingsCard id="experiment-settings" class="settings-card--experiment" tone="orange">
    <FormCardHeading icon="context" tone="orange">
      <div>
        <h2>Личный эксперимент</h2>
        <p>Попробуйте одно изменение несколько дней или недель, а потом запишите, что вы заметили.</p>
      </div>
    </FormCardHeading>
    <label class="toggle-row"
      ><span><strong>Включить эксперимент</strong><small>В ежедневной записи появится один дополнительный вопрос.</small></span
      ><input v-model="experiment.active" type="checkbox"
    /></label>
    <FormFieldLabel for="experiment-title">Что хотите попробовать</FormFieldLabel>
    <AutoGrowTextarea
      id="experiment-title"
      v-model="experiment.title"
      :rows="5"
      :max-length="experimentTextLimits.title"
      :read-only="identityLocked"
      placeholder="Не читать новости после 22:00"
    />
    <FormHint v-if="identityLocked">
      Условие и дата начала зафиксированы после первой дневной записи. Дату окончания можно продлить.
    </FormHint>
    <FormFieldLabel for="experiment-hypothesis" optional>Что хотите узнать</FormFieldLabel>
    <AutoGrowTextarea
      id="experiment-hypothesis"
      v-model="experiment.hypothesis"
      :rows="4"
      :max-length="experimentTextLimits.hypothesis"
      placeholder="Например: станет ли проще засыпать и сохранять энергию утром"
    />
    <FormRow>
      <label class="form-control"
        ><FormFieldLabel tag="span">С какого дня</FormFieldLabel><DateInput v-model="experiment.startDate" :disabled="identityLocked"
      /></label>
      <label class="form-control"
        ><FormFieldLabel tag="span">До какого дня</FormFieldLabel
        ><DateInput v-model="experiment.endDate" :min="identityLocked ? savedEndDate : undefined"
      /></label>
    </FormRow>
    <FormHint v-if="canConclude">
      Можно подвести итог и завершить эксперимент раньше срока. В этом случае датой окончания станет сегодняшний день.
    </FormHint>
    <template v-if="canConclude || experiment.conclusion.trim()">
      <FormFieldLabel for="experiment-conclusion">
        {{ canConclude ? 'Что вы заметили?' : 'Что заметили к этому моменту' }}
      </FormFieldLabel>
      <AutoGrowTextarea
        id="experiment-conclusion"
        v-model="experiment.conclusion"
        :rows="6"
        :max-length="experimentTextLimits.conclusion"
        placeholder="Опишите, что изменилось. Изменения могли произойти и по другим причинам."
      />
      <FormFieldLabel optional>
        {{ canConclude ? 'Что хотите делать дальше?' : 'Ранее выбранное решение' }}
      </FormFieldLabel>
      <ChipGroup v-model="experiment.decision" :options="experimentDecisionOptions" allow-clear />
    </template>
    <FormHint v-else-if="experiment.endDate">
      После начала здесь можно записать, что вы заметили, и завершить эксперимент. Он сохранится в разделе «История».
    </FormHint>
    <div class="experiment-actions">
      <ActionButton variant="primary" type="button" :disabled="saving" :busy="saving" busy-label="Сохраняю…" @click="$emit('save')">
        {{ saveLabel }}
      </ActionButton>
      <ActionButton v-if="canConclude" variant="secondary" type="button" :disabled="saving" @click="$emit('complete')">
        Завершить эксперимент
      </ActionButton>
    </div>
    <DataNote v-if="historyCount">Завершённые эксперименты можно посмотреть в разделе «История»: {{ historyCount }}.</DataNote>
  </SettingsCard>
</template>

<style scoped>
.experiment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid var(--experiment-section-divider);
  border-bottom: 1px solid var(--experiment-section-divider);
}
.toggle-row strong,
.toggle-row small {
  display: block;
}
.toggle-row small {
  margin-top: 4px;
  color: var(--muted);
}
.toggle-row input {
  width: 48px;
  height: 26px;
  accent-color: var(--accent-dark);
}
</style>
