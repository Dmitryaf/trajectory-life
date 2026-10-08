<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { dataCoverageLevel } from '@/features/analytics/coverage';
import { hasMeaningfulReview } from '@/features/reviews/telemetry';
import { hasUnsavedSyncEditors, onUnsavedSyncEditorsChange } from '@/features/sync/editing';
import DialogSurface from '@/shared/ui/overlays/DialogSurface.vue';
import DialogCloseButton from '@/shared/ui/overlays/DialogCloseButton.vue';
import { useDialogFocus } from '@/shared/ui/overlays/useDialogFocus';
import { useBodyScrollLock } from '@/shared/ui/overlays/useBodyScrollLock';
import { useDialogBackdropClose } from '@/shared/ui/overlays/useDialogBackdropClose';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { consentOfferKind } from '../consentEligibility';
import { productTelemetry, telemetryCollectionEnabled, telemetryState } from '../productTelemetry';
import ConsentDetails from './ConsentDetails.vue';
const store = useAppStore();
const route = useRoute();
const dialogSurface = ref<InstanceType<typeof DialogSurface>>();
const panel = computed(() => dialogSurface.value?.element);
const returnFocus = ref<HTMLElement>();
const visible = ref<'offer' | 'reminder' | null>(null);
const isOpen = computed(() => visible.value !== null);
useBodyScrollLock(isOpen);
const { handleDialogKeydown } = useDialogFocus(isOpen, panel, returnFocus);
const { startBackdropClose, finishBackdropClose, cancelBackdropClose } = useDialogBackdropClose(() => dismiss(true));
const interacted = ref(false);
const dirty = ref(hasUnsavedSyncEditors());
const attempted = new Set<string>();
const stopEditing = onUnsavedSyncEditorsChange((value) => {
  dirty.value = value;
});
const safe = computed(
  () =>
    !interacted.value &&
    !dirty.value &&
    ['idle', 'synced', 'disabled'].includes(store.cloudSyncStatus) &&
    ['/today', '/week'].includes(route.path) &&
    store.settings.firstUse.status !== 'in_progress',
);
const experience = computed(
  () =>
    store.dailyEntries.some((entry) => dataCoverageLevel(entry) > 0) ||
    store.weeklyReviews.some(hasMeaningfulReview) ||
    store.settings.firstUse.status === 'completed',
);
function interaction(event: Event) {
  if (
    event.target instanceof Element &&
    !panel.value?.contains(event.target) &&
    event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')
  ) {
    interacted.value = true;
  }
}
function otherDialogOpen() {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}
watch(
  () => [safe.value, consentOfferKind(telemetryState, experience.value)],
  async () => {
    if (!safe.value || !telemetryCollectionEnabled || visible.value || otherDialogOpen()) {
      return;
    }
    const kind = consentOfferKind(telemetryState, experience.value);
    if (!kind || attempted.has(kind)) {
      return;
    }
    attempted.add(kind);
    const offered = await productTelemetry.offer(kind);
    if (offered && safe.value && !otherDialogOpen()) {
      const focused = document.activeElement;
      const heading = document.querySelector<HTMLElement>('.app-main h1, .app-main h2');
      if (heading) {
        heading.tabIndex = -1;
      }
      returnFocus.value = focused instanceof HTMLElement && focused !== document.body ? focused : (heading ?? undefined);
      visible.value = kind;
    }
  },
  { immediate: true },
);
function close() {
  visible.value = null;
}

watch(
  () => [telemetryState.enabled, telemetryState.decision],
  () => {
    if (visible.value && (telemetryState.enabled || telemetryState.decision === 'declined')) {
      void close();
    }
  },
);
async function allow() {
  await productTelemetry.grant();
  if (telemetryState.enabled) {
    await close();
  }
}
function dismiss(later: boolean) {
  void (later ? productTelemetry.snooze() : productTelemetry.withdraw());
  void close();
}
onMounted(() => {
  if (document.activeElement?.matches('input, textarea, select, [contenteditable=true]')) {
    interacted.value = true;
  }
  for (const event of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(event, interaction, true);
  }
});
onBeforeUnmount(() => {
  stopEditing();
  for (const event of ['pointerdown', 'keydown', 'input']) {
    document.removeEventListener(event, interaction, true);
  }
});
</script>
<template>
  <Teleport to="body">
    <DialogSurface
      v-if="isOpen"
      ref="dialogSurface"
      labelledby="consent-offer-title"
      panel-class="consent-experience"
      @pointerdown="startBackdropClose"
      @pointerup="finishBackdropClose"
      @pointercancel="cancelBackdropClose"
      @keydown="handleDialogKeydown"
      @keydown.esc.stop.prevent="dismiss(true)"
    >
      <div class="dialog-heading">
        <h2 id="consent-offer-title">Помочь улучшать Траекторию?</h2>
        <DialogCloseButton label="Не сейчас" @click="dismiss(true)" />
      </div>
      <p>
        Можно передавать сведения об открытии разделов и сохранении записей. Без текстов дневника, целей и значений показателей. Это
        необязательно; решение можно изменить в Настройках.
      </p>
      <p v-if="visible === 'reminder'">
        Это последнее автоматическое предложение. Можно продолжить пользоваться приложением без статистики.
      </p>
      <div class="consent-experience__actions">
        <ActionButton variant="secondary" type="button" :disabled="telemetryState.busy" @click="allow">Разрешить</ActionButton>
        <ActionButton variant="secondary" type="button" @click="dismiss(true)">Не сейчас</ActionButton>
        <ActionButton variant="secondary" type="button" @click="dismiss(false)">Не предлагать</ActionButton>
      </div>
      <ConsentDetails />
      <p class="consent-experience__status" role="status">{{ telemetryState.message }}</p>
    </DialogSurface>
  </Teleport>
</template>
<style scoped>
h2 {
  margin-top: 0;
  font-size: 20px;
}
p {
  line-height: 1.6;
}
.consent-experience__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.consent-experience__actions :deep(button) {
  flex: 1 1 140px;
  min-height: 48px;
}
.consent-experience__status {
  min-height: 2lh;
  margin-bottom: 0;
}
</style>
