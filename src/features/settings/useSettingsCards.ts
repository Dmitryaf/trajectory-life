import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { useAppStore } from '@/stores/app';
import type { AppSettings } from '@/types';
import { plainCopy } from '@/services/plain';
import { setSyncEditorDirty } from '../sync/editing';

const cardFields = {
  'daily-blocks': ['activeDailyBlocks'],
  'life-areas': ['activeLifeAreas', 'customLifeAreaOptions'],
  activity: ['customActivityOptions', 'hiddenActivityIds'],
  career: ['customCareerOptions'],
  context: ['customContextFactorOptions', 'hiddenContextFactorIds'],
  nutrition: ['nutritionGoalCriterion'],
  experiment: ['experiment', 'experimentHistory'],
} as const satisfies Record<string, readonly (keyof AppSettings)[]>;

export type SettingsCardId = keyof typeof cardFields;

export function useSettingsCards(store: ReturnType<typeof useAppStore>) {
  const settings = reactive<AppSettings>(plainCopy(store.settings));
  const settingsBaseline = ref(plainCopy(store.settings));
  const settingsDirty = computed(() => JSON.stringify(settings) !== JSON.stringify(settingsBaseline.value));
  watch(settingsDirty, (dirty) => setSyncEditorDirty('settings', dirty), { immediate: true });
  function replaceSettingsFromStore() {
    Object.assign(settings, plainCopy(store.settings));
    settingsBaseline.value = plainCopy(store.settings);
  }
  function handleCloudSnapshotApplied() {
    const incoming = plainCopy(store.settings);
    for (const field of Object.keys(incoming) as Array<keyof AppSettings>) {
      if (JSON.stringify(settings[field]) === JSON.stringify(settingsBaseline.value[field])) {
        Object.assign(settings, { [field]: plainCopy(incoming[field]) });
      }
    }
    settingsBaseline.value = incoming;
  }
  window.addEventListener('trajectory:cloud-snapshot-applied', handleCloudSnapshotApplied);
  onBeforeUnmount(() => {
    setSyncEditorDirty('settings', false);
    window.removeEventListener('trajectory:cloud-snapshot-applied', handleCloudSnapshotApplied);
  });

  function cardDirty(card: SettingsCardId) {
    return cardFields[card].some((field) => JSON.stringify(settings[field]) !== JSON.stringify(settingsBaseline.value[field]));
  }

  async function saveCard(action: SettingsCardId, next: AppSettings) {
    const fields = cardFields[action];
    const before = plainCopy(settings);
    await store.saveSettings(next, fields);
    for (const field of fields) {
      const persisted = { [field]: plainCopy(store.settings[field]) };
      Object.assign(settingsBaseline.value, persisted);
      if (JSON.stringify(settings[field]) === JSON.stringify(before[field])) {
        Object.assign(settings, plainCopy(persisted));
      }
    }
  }

  return { settings, saveCard, cardDirty, replaceSettingsFromStore };
}
