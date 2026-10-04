import { confirmDataReset } from './confirmDataReset';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useExperimentSettings } from '../experiments/useExperimentSettings';
import { notifyInfo, notifySaved, notifyUnknownError } from '@/services/notifications';
import { plainCopy } from '@/services/plain';
import { setSyncEditorDirty } from '../sync/editing';
import { confirmBackupImport, downloadBackup } from '../backup/browser';
import {
  activityOptions,
  careerOptions,
  contextFactorOptions,
  createCustomOption,
  dailyBlockOptions,
  legacyActivityOptions,
  legacyCareerOptions,
  lifeAreaOptions,
  type ActivityId,
  type AppSettings,
  type CareerState,
  type ContextFactorId,
  type LifeAreaId,
  type Option,
} from '@/types';

export function useSettingsForm() {
  const store = useAppStore();
  const settings = reactive<AppSettings>(plainCopy(store.settings));
  const settingsBaseline = ref(JSON.stringify(store.settings));
  const settingsDirty = computed(() => JSON.stringify(settings) !== settingsBaseline.value);
  watch(settingsDirty, (dirty) => setSyncEditorDirty('settings', dirty), { immediate: true });
  function replaceSettingsFromStore() {
    Object.assign(settings, plainCopy(store.settings));
    settingsBaseline.value = JSON.stringify(store.settings);
  }
  function handleCloudSnapshotApplied() {
    if (!settingsDirty.value) {
      replaceSettingsFromStore();
    }
  }
  window.addEventListener('trajectory:cloud-snapshot-applied', handleCloudSnapshotApplied);
  onBeforeUnmount(() => {
    setSyncEditorDirty('settings', false);
    window.removeEventListener('trajectory:cloud-snapshot-applied', handleCloudSnapshotApplied);
  });
  const importInput = ref<HTMLInputElement>();
  const newCareerLabel = ref('');
  const newActivityLabel = ref('');
  const newLifeAreaLabel = ref('');
  const newContextFactorLabel = ref('');
  const savingActions = reactive(new Set<string>());
  const auth = useAuthStore();
  const allCareerOptions = computed(() => {
    const usedIds = new Set([
      ...store.dailyEntries.flatMap((entry) => entry.careerStates),
      ...store.dailyEntries.flatMap((entry) => (entry.careerState ? [entry.careerState] : [])),
    ]);
    return Array.from(
      new Map(
        [
          ...careerOptions,
          ...settings.customCareerOptions.filter((option) => !option.archived),
          ...legacyCareerOptions.filter((option) => usedIds.has(option.id)),
        ].map((option) => [option.id, option]),
      ).values(),
    );
  });
  const activeActivityOptions = computed(() => [
    ...activityOptions.filter((option) => !settings.hiddenActivityIds.includes(option.id)),
    ...settings.customActivityOptions.filter((option) => !option.archived),
  ]);
  const hiddenActivityOptions = computed(() => [
    ...activityOptions.filter((option) => settings.hiddenActivityIds.includes(option.id)),
    ...settings.customActivityOptions.filter((option) => option.archived),
  ]);
  const allLifeAreaOptions = computed(() => [...lifeAreaOptions, ...settings.customLifeAreaOptions.filter((option) => !option.archived)]);
  const activeContextFactorOptions = computed(() => [
    ...contextFactorOptions.filter((option) => !settings.hiddenContextFactorIds.includes(option.id)),
    ...settings.customContextFactorOptions.filter((option) => !option.archived),
  ]);
  const hiddenContextFactorOptions = computed(() => [
    ...contextFactorOptions.filter((option) => settings.hiddenContextFactorIds.includes(option.id)),
    ...settings.customContextFactorOptions.filter((option) => option.archived),
  ]);
  const cloudSession = computed(() => auth.session);
  const storageProtectionTitle = computed(() => {
    if (store.storagePersistenceStatus === 'persisted') {
      return 'Локальное хранилище защищено';
    }
    if (store.storagePersistenceStatus === 'checking' || store.storagePersistenceStatus === 'unknown') {
      return 'Проверяю локальное хранилище';
    }
    if (store.storagePersistenceStatus === 'best-effort') {
      return 'Локальное хранилище работает без дополнительной защиты';
    }
    if (store.storagePersistenceStatus === 'unsupported') {
      return 'Режим хранения не сообщается браузером';
    }
    return 'Не удалось проверить режим хранения';
  });
  const storageProtectionText = computed(() => {
    if (store.storagePersistenceStatus === 'persisted') {
      return 'Браузер постарается не удалять локальные записи автоматически. Это не заменяет облачную копию или экспорт JSON.';
    }
    if (store.storagePersistenceStatus === 'checking' || store.storagePersistenceStatus === 'unknown') {
      return 'Записи уже доступны. Проверка не блокирует работу приложения.';
    }
    return 'Записи сохраняются на устройстве, но браузер может очистить их при нехватке места. Используйте облачную копию и периодически скачивайте JSON.';
  });
  function isSaving(action: string) {
    return savingActions.has(action);
  }

  async function runAction(action: string, fallback: string, operation: () => Promise<void>) {
    if (isSaving(action)) {
      return false;
    }
    savingActions.add(action);
    try {
      await operation();
      return true;
    } catch (error) {
      notifyUnknownError(error, fallback);
      return false;
    } finally {
      savingActions.delete(action);
    }
  }

  async function save(message = 'Настройки сохранены', action = 'settings', nextSettings: AppSettings = plainCopy(settings)) {
    return runAction(action, 'Не удалось сохранить настройки', async () => {
      await store.saveSettings(nextSettings);
      settingsBaseline.value = JSON.stringify(nextSettings);
      notifySaved(message);
    });
  }
  const { completeExperiment, experimentCanConclude, experimentIdentityLocked, experimentSaveLabel, saveExperiment } =
    useExperimentSettings(settings, isSaving, save);

  async function addCareerOption() {
    if (isSaving('career')) {
      return;
    }
    const label = newCareerLabel.value.trim();
    if (!label || hasOption(careerOptions, label)) {
      return;
    }
    const archived = findArchived(settings.customCareerOptions, label);
    if (archived) {
      archived.archived = false;
      newCareerLabel.value = '';
      await save('Настройки сохранены', 'career');
      return;
    }
    if (hasOption(settings.customCareerOptions, label)) {
      return;
    }
    settings.customCareerOptions.push({ ...createCustomOption(label, 'career'), countsAsExternal: false });
    newCareerLabel.value = '';
    await save('Настройки сохранены', 'career');
  }

  async function addActivityOption() {
    if (isSaving('activity')) {
      return;
    }
    const label = newActivityLabel.value.trim();
    if (!label) {
      return;
    }
    const hiddenBuiltIn = activityOptions.find(
      (option) => settings.hiddenActivityIds.includes(option.id) && sameLabel(option.label, label),
    );
    if (hiddenBuiltIn) {
      settings.hiddenActivityIds = settings.hiddenActivityIds.filter((id) => id !== hiddenBuiltIn.id);
      newActivityLabel.value = '';
      await save('Вариант активности возвращён', 'activity');
      return;
    }
    if (hasOption(activityOptions, label)) {
      return;
    }
    const archived = findArchived(settings.customActivityOptions, label);
    if (archived) {
      archived.archived = false;
    } else if (!hasOption(settings.customActivityOptions, label)) {
      const legacy = legacyActivityOptions.find((option) => sameLabel(option.label, label));
      settings.customActivityOptions.push(legacy ? { ...legacy, custom: true } : createCustomOption(label, 'activity'));
    }
    newActivityLabel.value = '';
    await save('Варианты активности сохранены', 'activity');
  }

  async function removeActivityOption(id: ActivityId) {
    if (isSaving('activity')) {
      return;
    }
    const option = settings.customActivityOptions.find((item) => item.id === id);
    if (option) {
      option.archived = true;
    } else if (!settings.hiddenActivityIds.includes(id)) {
      settings.hiddenActivityIds.push(id);
    }
    await save('Вариант убран из ежедневной записи', 'activity');
  }

  async function restoreActivityOption(id: ActivityId) {
    if (isSaving('activity')) {
      return;
    }
    const option = settings.customActivityOptions.find((item) => item.id === id);
    if (option) {
      option.archived = false;
    } else {
      settings.hiddenActivityIds = settings.hiddenActivityIds.filter((activityId) => activityId !== id);
    }
    await save('Вариант активности возвращён', 'activity');
  }

  async function removeCareerOption(id: CareerState) {
    if (isSaving('career')) {
      return;
    }
    const option = settings.customCareerOptions.find((item) => item.id === id);
    if (option) {
      option.archived = true;
    }
    await save('Настройки сохранены', 'career');
  }

  async function addLifeArea() {
    if (isSaving('life-areas')) {
      return;
    }
    const label = newLifeAreaLabel.value.trim();
    if (!label || hasOption(lifeAreaOptions, label)) {
      return;
    }
    const archived = findArchived(settings.customLifeAreaOptions, label);
    if (archived) {
      archived.archived = false;
      settings.activeLifeAreas.push(archived.id);
      newLifeAreaLabel.value = '';
      await save('Настройки сохранены', 'life-areas');
      return;
    }
    if (hasOption(settings.customLifeAreaOptions, label)) {
      return;
    }
    const option = createCustomOption(label, 'life');
    settings.customLifeAreaOptions.push(option);
    settings.activeLifeAreas.push(option.id);
    newLifeAreaLabel.value = '';
    await save('Настройки сохранены', 'life-areas');
  }

  async function removeLifeArea(id: LifeAreaId) {
    if (isSaving('life-areas')) {
      return;
    }
    const option = settings.customLifeAreaOptions.find((item) => item.id === id);
    if (option) {
      option.archived = true;
    }
    settings.activeLifeAreas = settings.activeLifeAreas.filter((area) => area !== id);
    await save('Настройки сохранены', 'life-areas');
  }

  async function addContextFactor() {
    if (isSaving('context')) {
      return;
    }
    const label = newContextFactorLabel.value.trim();
    if (!label) {
      return;
    }
    const hiddenBuiltIn = contextFactorOptions.find(
      (option) => settings.hiddenContextFactorIds.includes(option.id) && sameLabel(option.label, label),
    );
    if (hiddenBuiltIn) {
      settings.hiddenContextFactorIds = settings.hiddenContextFactorIds.filter((id) => id !== hiddenBuiltIn.id);
      newContextFactorLabel.value = '';
      await save('Фактор дня возвращён', 'context');
      return;
    }
    if (hasOption(contextFactorOptions, label)) {
      return;
    }
    const archived = findArchived(settings.customContextFactorOptions, label);
    if (archived) {
      archived.archived = false;
    } else if (!hasOption(settings.customContextFactorOptions, label)) {
      settings.customContextFactorOptions.push(createCustomOption(label, 'context'));
    }
    newContextFactorLabel.value = '';
    await save('Факторы дня сохранены', 'context');
  }

  async function removeContextFactor(id: ContextFactorId) {
    if (isSaving('context')) {
      return;
    }
    const option = settings.customContextFactorOptions.find((item) => item.id === id);
    if (option) {
      option.archived = true;
    } else if (!settings.hiddenContextFactorIds.includes(id)) {
      settings.hiddenContextFactorIds.push(id);
    }
    await save('Фактор убран из ежедневной записи', 'context');
  }

  async function restoreContextFactor(id: ContextFactorId) {
    if (isSaving('context')) {
      return;
    }
    const option = settings.customContextFactorOptions.find((item) => item.id === id);
    if (option) {
      option.archived = false;
    } else {
      settings.hiddenContextFactorIds = settings.hiddenContextFactorIds.filter((factorId) => factorId !== id);
    }
    await save('Фактор дня возвращён', 'context');
  }

  function hasOption(options: { label: string }[], label: string) {
    return options.some((option) => sameLabel(option.label, label));
  }

  function sameLabel(left: string, right: string) {
    return left.trim().toLocaleLowerCase('ru-RU') === right.trim().toLocaleLowerCase('ru-RU');
  }

  function findArchived<T extends string>(options: Option<T>[], label: string) {
    return options.find((option) => option.archived && option.label.trim().toLocaleLowerCase('ru-RU') === label.toLocaleLowerCase('ru-RU'));
  }

  function exportData() {
    try {
      downloadBackup(store.exportData());
      notifyInfo('Скачивание резервной копии начато');
    } catch (error) {
      notifyUnknownError(error, 'Не удалось скачать резервную копию');
    }
  }

  async function importData(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || isSaving('import')) {
      return;
    }
    try {
      await runAction('import', 'Не удалось восстановить копию', async () => {
        const payload = JSON.parse(await file.text());
        if (!confirmBackupImport(payload, file.name, Boolean(cloudSession.value))) {
          return;
        }
        await store.importData(payload, { syncCloud: Boolean(cloudSession.value) });
        replaceSettingsFromStore();
        notifySaved('Резервная копия восстановлена на этом устройстве');
      });
    } finally {
      if (importInput.value) {
        importInput.value.value = '';
      }
    }
  }

  async function clearAll() {
    if (isSaving('clear-data') || !confirmDataReset(Boolean(cloudSession.value))) {
      return;
    }
    await runAction('clear-data', 'Не удалось удалить данные', async () => {
      await store.clearAll({ syncCloud: Boolean(cloudSession.value) });
      replaceSettingsFromStore();
      notifyInfo('Записи и настройки на этом устройстве удалены');
    });
  }

  return {
    dailyBlockOptions,
    store,
    settings,
    importInput,
    newCareerLabel,
    newActivityLabel,
    newLifeAreaLabel,
    newContextFactorLabel,
    allCareerOptions,
    activeActivityOptions,
    hiddenActivityOptions,
    allLifeAreaOptions,
    activeContextFactorOptions,
    hiddenContextFactorOptions,
    storageProtectionTitle,
    storageProtectionText,
    experimentCanConclude,
    experimentIdentityLocked,
    experimentSaveLabel,
    isSaving,
    save,
    saveExperiment,
    completeExperiment,
    addCareerOption,
    addActivityOption,
    removeActivityOption,
    restoreActivityOption,
    removeCareerOption,
    addLifeArea,
    removeLifeArea,
    addContextFactor,
    removeContextFactor,
    restoreContextFactor,
    exportData,
    importData,
    clearAll,
    replaceSettingsFromStore,
  };
}
