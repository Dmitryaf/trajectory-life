<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { computed, nextTick, ref, toRef, watch } from 'vue';
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import DateInput from '@/shared/ui/forms/DateInput.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import DialogCloseButton from '@/shared/ui/overlays/DialogCloseButton.vue';
import DialogSurface from '@/shared/ui/overlays/DialogSurface.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { useBodyScrollLock } from '@/shared/ui/overlays/useBodyScrollLock';
import { useDialogBackdropClose } from '@/shared/ui/overlays/useDialogBackdropClose';
import { useDialogFocus } from '@/shared/ui/overlays/useDialogFocus';

const props = defineProps<{
  open: boolean;
  title: string;
  outcomeCriterion: string;
  reviewDate: string;
  externalEvidenceCriterion: string;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  remove: [];
  save: [goal: { title: string; outcomeCriterion: string; reviewDate: string; externalEvidenceCriterion: string }];
}>();

const draftTitle = ref('');
const draftOutcomeCriterion = ref('');
const draftReviewDate = ref('');
const draftExternalEvidenceCriterion = ref('');
const titleInput = ref<HTMLInputElement>();
const dialogSurface = ref<InstanceType<typeof DialogSurface>>();
const dialog = computed(() => dialogSurface.value?.element);

useBodyScrollLock(toRef(props, 'open'));
const { handleDialogKeydown } = useDialogFocus(toRef(props, 'open'), dialog);

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      return;
    }
    draftTitle.value = props.title;
    draftOutcomeCriterion.value = props.outcomeCriterion;
    draftReviewDate.value = props.reviewDate;
    draftExternalEvidenceCriterion.value = props.externalEvidenceCriterion;
    await nextTick();
    titleInput.value?.focus();
  },
);

function close() {
  if (!props.saving) {
    emit('close');
  }
}

const { startBackdropClose, finishBackdropClose, cancelBackdropClose } = useDialogBackdropClose(close);

function submit() {
  const preparedTitle = draftTitle.value.trim();
  if (!preparedTitle || props.saving) {
    return;
  }
  emit('save', {
    title: preparedTitle,
    outcomeCriterion: draftOutcomeCriterion.value.trim(),
    reviewDate: draftReviewDate.value,
    externalEvidenceCriterion: draftExternalEvidenceCriterion.value.trim(),
  });
}

function remove() {
  if (!props.saving) {
    emit('remove');
  }
}
</script>

<template>
  <Teleport to="body">
    <DialogSurface
      v-if="open"
      ref="dialogSurface"
      backdrop-class="goal-dialog-backdrop"
      panel-class="goal-dialog"
      labelledby="current-goal-dialog-title"
      mobile="sheet"
      width="min(560px, 100%)"
      @pointerdown="startBackdropClose"
      @pointerup="finishBackdropClose"
      @pointercancel="cancelBackdropClose"
      @keydown="handleDialogKeydown"
      @keydown.esc="close"
    >
      <div class="dialog-heading goal-dialog__heading">
        <div>
          <EyebrowText>Текущая цель</EyebrowText>
          <h2 id="current-goal-dialog-title">Над чем вы сейчас работаете</h2>
        </div>
        <DialogCloseButton label="Закрыть выбор цели" :disabled="saving" @click="close" />
      </div>

      <form @submit.prevent="submit">
        <FormFieldLabel for="current-goal-title">Что хотите изменить или закончить</FormFieldLabel>
        <input
          id="current-goal-title"
          ref="titleInput"
          v-model="draftTitle"
          type="text"
          maxlength="100"
          required
          placeholder="Например: подготовиться к собеседованию"
        />

        <FormFieldLabel for="current-goal-outcome">Как понять, что получилось</FormFieldLabel>
        <input
          id="current-goal-outcome"
          v-model="draftOutcomeCriterion"
          type="text"
          maxlength="220"
          placeholder="Наблюдаемый результат — необязательно"
        />

        <FormFieldLabel for="current-goal-review-date">Когда вернуться к цели</FormFieldLabel>
        <DateInput id="current-goal-review-date" v-model="draftReviewDate" />

        <FormFieldLabel for="current-goal-evidence">Что считать шагом к цели</FormFieldLabel>
        <AutoGrowTextarea
          id="current-goal-evidence"
          v-model="draftExternalEvidenceCriterion"
          :rows="2"
          :max-length="220"
          placeholder="Например: выполненное задание, тренировка, разговор или принятое решение"
        />
        <p class="goal-dialog__hint">Цель помогает связать отдельные шаги с периодом, но не обязательна для сохранения дня.</p>

        <div class="dialog-actions goal-dialog__actions">
          <ActionButton v-if="title" variant="secondary" type="button" :disabled="saving" @click="remove">Убрать цель</ActionButton>
          <ActionButton variant="secondary" type="button" :disabled="saving" @click="close">Отмена</ActionButton>
          <ActionButton variant="primary" type="submit" :disabled="saving || !draftTitle.trim()" :busy="saving" busy-label="Сохраняю…"
            >Сохранить цель</ActionButton
          >
        </div>
      </form>
    </DialogSurface>
  </Teleport>
</template>

<style scoped>
.goal-dialog__heading {
  margin-bottom: 18px;
}
.goal-dialog__heading h2 {
  font-size: 25px;
}
:deep(.goal-dialog form) {
  display: grid;
  gap: 10px;
}
.goal-dialog__hint {
  margin: 0;
  color: var(--dialog-helper-text);
  font-size: 12px;
  line-height: 1.5;
}
.goal-dialog__actions {
  margin-top: 10px;
}
.goal-dialog__actions button {
  min-width: 130px;
}

@media (max-width: 720px) {
  .goal-dialog__actions {
    flex-direction: column-reverse;
  }
  .goal-dialog__actions button {
    width: 100%;
  }
}
</style>
