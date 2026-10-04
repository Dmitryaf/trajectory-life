<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { dataCoverageLevel } from '@/features/analytics/coverage';
import { hasMeaningfulReview } from '@/features/reviews/telemetry';
import { hasUnsavedSyncEditors, onUnsavedSyncEditorsChange } from '@/features/sync/editing';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { consentOfferKind } from '../consentEligibility';
import { productTelemetry, telemetryCollectionEnabled, telemetryState } from '../productTelemetry';
import ConsentDetails from './ConsentDetails.vue';
const store = useAppStore();
const route = useRoute();
const panel = ref<HTMLElement>();
const visible = ref<'offer' | 'reminder' | null>(null);
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
watch(
  () => [safe.value, consentOfferKind(telemetryState, experience.value)],
  async () => {
    if (!safe.value || !telemetryCollectionEnabled || visible.value) {
      return;
    }
    const kind = consentOfferKind(telemetryState, experience.value);
    if (!kind || attempted.has(kind)) {
      return;
    }
    attempted.add(kind);
    const offered = await productTelemetry.offer(kind);
    if (offered && safe.value) {
      visible.value = kind;
    }
  },
  { immediate: true },
);
async function close() {
  const restoreFocus = panel.value?.contains(document.activeElement);
  visible.value = null;
  if (restoreFocus) {
    await nextTick();
    const target = document.querySelector<HTMLElement>('.app-main h1, .app-main h2');
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
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
  <section
    v-if="visible && !['pending', 'conflict', 'error', 'syncing'].includes(store.cloudSyncStatus)"
    ref="panel"
    class="consent-experience"
    aria-labelledby="consent-offer-title"
  >
    <h2 id="consent-offer-title">Помочь улучшать Траекторию?</h2>
    <p>
      Можно передавать сведения об открытии разделов и сохранении записей. Без текстов дневника, целей и значений показателей. Это
      необязательно; решение можно изменить в Настройках.
    </p>
    <p v-if="visible === 'offer'">
      Если выбрать «Не сейчас», предложим ещё один раз не раньше чем через неделю, когда появятся записи или первый обзор.
    </p>
    <p v-else>Это последнее автоматическое предложение. Можно продолжить пользоваться приложением без статистики.</p>
    <div class="consent-experience__actions">
      <ActionButton variant="secondary" type="button" :disabled="telemetryState.busy" @click="allow">Разрешить</ActionButton>
      <ActionButton v-if="visible === 'offer'" variant="secondary" type="button" @click="dismiss(true)">Не сейчас</ActionButton>
      <ActionButton variant="secondary" type="button" @click="dismiss(false)">Не предлагать</ActionButton>
    </div>
    <ConsentDetails />
    <p class="consent-experience__status" role="status">{{ telemetryState.message }}</p>
  </section>
</template>
<style scoped>
.consent-experience {
  margin-bottom: 24px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
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
