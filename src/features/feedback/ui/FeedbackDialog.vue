<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { computed, nextTick, ref } from 'vue';
import { sendFeedback } from '@/services/feedback';
import { notifyError, notifySaved } from '@/services/notifications';
import DialogCloseButton from '@/shared/ui/overlays/DialogCloseButton.vue';
import DialogSurface from '@/shared/ui/overlays/DialogSurface.vue';
import UtilityTriggerButton from '@/shared/ui/actions/UtilityTriggerButton.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import { useBodyScrollLock } from '@/shared/ui/overlays/useBodyScrollLock';
import { useDialogBackdropClose } from '@/shared/ui/overlays/useDialogBackdropClose';
import { useDialogFocus } from '@/shared/ui/overlays/useDialogFocus';

const props = defineProps<{
  accessToken: string;
}>();

const isOpen = ref(false);
const isSending = ref(false);
const message = ref('');
const messageInput = ref<HTMLTextAreaElement>();
const dialogSurface = ref<InstanceType<typeof DialogSurface>>();
const dialog = computed(() => dialogSurface.value?.element);

useBodyScrollLock(isOpen);
const { handleDialogKeydown } = useDialogFocus(isOpen, dialog);

async function open() {
  isOpen.value = true;
  await nextTick();
  messageInput.value?.focus();
}

function close() {
  if (isSending.value) {
    return;
  }
  isOpen.value = false;
}

const { startBackdropClose, finishBackdropClose, cancelBackdropClose } = useDialogBackdropClose(close);

async function submit() {
  const value = message.value.trim();
  if (value.length < 3) {
    notifyError('Напиши хотя бы несколько слов');
    return;
  }

  isSending.value = true;
  try {
    await sendFeedback(value, props.accessToken);
    message.value = '';
    isOpen.value = false;
    notifySaved('Спасибо, сообщение отправлено');
  } catch (error) {
    notifyError(error instanceof Error ? error.message : 'Не удалось отправить сообщение');
  } finally {
    isSending.value = false;
  }
}
</script>

<template>
  <UtilityTriggerButton
    class="feedback-trigger"
    icon="feedback"
    aria-label="Обратная связь"
    title="Обратная связь"
    aria-haspopup="dialog"
    @click="open"
  >
    Обратная связь
  </UtilityTriggerButton>

  <Teleport to="body">
    <DialogSurface
      v-if="isOpen"
      ref="dialogSurface"
      backdrop-class="feedback-backdrop"
      panel-class="feedback-dialog"
      labelledby="feedback-title"
      width="min(540px, 100%)"
      @pointerdown="startBackdropClose"
      @pointerup="finishBackdropClose"
      @pointercancel="cancelBackdropClose"
      @keydown="handleDialogKeydown"
      @keydown.esc="close"
    >
      <div class="dialog-heading feedback-dialog__heading">
        <div>
          <h2 id="feedback-title">Написать разработчику</h2>
        </div>
        <DialogCloseButton label="Закрыть форму" :disabled="isSending" @click="close" />
      </div>

      <form @submit.prevent="submit">
        <FormFieldLabel for="feedback-message">Предложение, проблема или ошибка</FormFieldLabel>
        <textarea
          id="feedback-message"
          ref="messageInput"
          v-model="message"
          rows="7"
          minlength="3"
          maxlength="4000"
          required
          placeholder="Расскажи, что произошло или чего не хватило. Для ошибки можно добавить короткие шаги воспроизведения."
        ></textarea>
        <p class="feedback-dialog__hint">
          К сообщению будет приложен email аккаунта, чтобы при необходимости уточнить детали. Не отправляй пароли, код приглашения и
          содержимое личных записей.
        </p>
        <div class="dialog-actions feedback-dialog__actions">
          <ActionButton variant="secondary" type="button" :disabled="isSending" @click="close">Отмена</ActionButton>
          <ActionButton
            variant="primary"
            type="submit"
            :disabled="isSending || message.trim().length < 3"
            :busy="isSending"
            busy-label="Отправляю…"
            >Отправить</ActionButton
          >
        </div>
      </form>
    </DialogSurface>
  </Teleport>
</template>

<style scoped>
.feedback-dialog__heading {
  margin-bottom: 18px;
}
.feedback-dialog__heading h2 {
  font-size: 25px;
}
.feedback-dialog__actions {
  margin-top: 20px;
}
:deep(.feedback-dialog textarea) {
  min-height: 150px;
}
.feedback-dialog__hint {
  margin: 10px 0 0;
  color: var(--dialog-helper-text);
  font-size: 12px;
  line-height: 1.5;
}
.feedback-dialog__actions button {
  min-width: 120px;
}

@media (max-width: 720px) {
  .feedback-dialog__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .feedback-dialog__actions button {
    min-width: 0;
  }
}
</style>
