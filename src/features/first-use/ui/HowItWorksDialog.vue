<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { RouterLink } from 'vue-router';
import { computed, nextTick, ref, watch } from 'vue';
import DialogCloseButton from '@/shared/ui/overlays/DialogCloseButton.vue';
import DialogSurface from '@/shared/ui/overlays/DialogSurface.vue';
import UtilityTriggerButton from '@/shared/ui/actions/UtilityTriggerButton.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import { useBodyScrollLock } from '@/shared/ui/overlays/useBodyScrollLock';
import { useDialogBackdropClose } from '@/shared/ui/overlays/useDialogBackdropClose';
import { useDialogFocus } from '@/shared/ui/overlays/useDialogFocus';
import AiAnalysisSteps from '@/features/analysis/ui/AiAnalysisSteps.vue';

const props = withDefaults(
  defineProps<{
    openForFirstVisit?: boolean;
    buttonLabel?: string;
    inline?: boolean;
  }>(),
  { openForFirstVisit: false, buttonLabel: 'Как это работает', inline: false },
);

const emit = defineEmits<{ 'intro-seen': [] }>();
const isOpen = ref(false);
const trigger = ref<InstanceType<typeof UtilityTriggerButton>>();
const triggerButton = computed(() => trigger.value?.element);
const closeButton = ref<InstanceType<typeof DialogCloseButton>>();
const dialogSurface = ref<InstanceType<typeof DialogSurface>>();
const dialog = computed(() => dialogSurface.value?.element);
const openedAsIntro = ref(false);

useBodyScrollLock(isOpen);
const { handleDialogKeydown } = useDialogFocus(isOpen, dialog, triggerButton);

watch(
  () => props.openForFirstVisit,
  async (shouldOpen) => {
    if (!shouldOpen) {
      if (openedAsIntro.value) {
        isOpen.value = false;
        openedAsIntro.value = false;
      }
      return;
    }
    if (isOpen.value) {
      return;
    }
    openedAsIntro.value = true;
    isOpen.value = true;
    await nextTick();
    closeButton.value?.focus();
  },
  { immediate: true },
);

async function open() {
  openedAsIntro.value = false;
  isOpen.value = true;
  await nextTick();
  closeButton.value?.focus();
}

function close() {
  isOpen.value = false;
  if (openedAsIntro.value) {
    emit('intro-seen');
  }
  openedAsIntro.value = false;
}

const { startBackdropClose, finishBackdropClose, cancelBackdropClose } = useDialogBackdropClose(close);
</script>

<template>
  <UtilityTriggerButton
    ref="trigger"
    class="help-link"
    :class="{ 'help-link--inline': inline }"
    icon="help"
    :variant="inline ? 'inline' : 'help'"
    aria-label="Как работает приложение"
    title="Как это работает"
    aria-haspopup="dialog"
    @click="open"
  >
    {{ buttonLabel }}
  </UtilityTriggerButton>

  <Teleport to="body">
    <DialogSurface
      v-if="isOpen"
      ref="dialogSurface"
      backdrop-class="help-backdrop"
      panel-class="help-dialog"
      labelledby="how-it-works-title"
      width="min(620px, 100%)"
      padding="28px"
      @pointerdown="startBackdropClose"
      @pointerup="finishBackdropClose"
      @pointercancel="cancelBackdropClose"
      @keydown="handleDialogKeydown"
      @keydown.esc="close"
    >
      <div class="dialog-heading help-dialog__heading">
        <div>
          <EyebrowText>Зачем нужны записи</EyebrowText>
          <h2 id="how-it-works-title">Зачем нужна «Траектория»</h2>
        </div>
        <DialogCloseButton ref="closeButton" label="Закрыть объяснение" @click="close" />
      </div>

      <p class="help-dialog__lead">
        Записи помогают вспомнить период по конкретным событиям, результатам и условиям. Приложение ничего не оценивает: следующий шаг
        выбираете вы.
      </p>

      <ol class="help-steps">
        <li>
          <span>1</span>
          <div>
            <strong>Записать важное</strong>
            <p>Коротко отметьте событие, результат, состояние или условие дня. Заполнять все поля не обязательно.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Увидеть период целиком</strong>
            <p>В обзоре недели или месяца записи окажутся рядом. Так проще заметить, что происходило и что менялось.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Сохранить следующее решение</strong>
            <p>Решите, что оставить, изменить или проверить дальше. Продолжить как есть и пока ничего не менять — тоже нормальный выбор.</p>
          </div>
        </li>
      </ol>

      <p class="help-dialog__note">
        Сами по себе записи не являются целью. Они нужны для одного решения: что оставить, что изменить или что проверить дальше.
      </p>

      <section class="help-dialog__note help-dialog__analysis" aria-labelledby="external-analysis-title">
        <strong id="external-analysis-title">Разобрать записи во внешней нейросети</strong>
        <p>Когда накопятся записи, приложение может собрать их в понятный текст для дополнительного разбора.</p>
        <AiAnalysisSteps />
        <div class="dialog-actions help-dialog__actions">
          <ActionButton :as="RouterLink" variant="secondary" to="/week#ai-analysis" @click="close">
            Подготовить текст для нейросети <UiIcon name="arrow-right" />
          </ActionButton>
        </div>
      </section>

      <div class="dialog-actions help-dialog__actions">
        <ActionButton :as="RouterLink" variant="secondary" to="/settings#daily-settings" @click="close">Настроить записи</ActionButton>
        <ActionButton :as="RouterLink" variant="primary" to="/today" @click="close">Начать запись</ActionButton>
      </div>
    </DialogSurface>
  </Teleport>
</template>

<style scoped>
.help-dialog__actions a {
  display: flex;
  min-width: 0;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-right: 14px;
  padding-left: 14px;
  line-height: 1.25;
  text-align: center;
}
.help-dialog__heading h2 {
  font-size: 26px;
}
.help-dialog__lead {
  margin: 14px 0 20px;
  color: var(--how-it-works-text);
  line-height: 1.55;
}
.help-steps {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.help-steps li {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: var(--how-it-works-step-surface);
}
.help-steps li > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 11px;
  background: var(--how-it-works-number-surface);
  color: var(--how-it-works-number-text);
  font-weight: 850;
}
.help-steps strong,
.help-steps p {
  display: block;
}
.help-steps p {
  margin: 3px 0 0;
  color: var(--how-it-works-muted);
  font-size: 13px;
  line-height: 1.45;
}
.help-dialog__note {
  margin: 18px 0 0;
  padding: 13px 15px;
  border-left: 3px solid var(--how-it-works-note-border);
  border-radius: 0 12px 12px 0;
  background: var(--how-it-works-note-surface);
  color: var(--form-disclosure-text);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .help-dialog__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .help-dialog__actions a {
    width: 100%;
  }
}
</style>
