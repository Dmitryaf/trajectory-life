import { computed, getCurrentInstance, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, type Router } from 'vue-router';
import { validDate } from '@/model/normalization';
import { formatDate, todayKey } from '@/services/dates';
import { notifyError, notifySaved, notifyUnknownError } from '@/services/notifications';
import { plainCopy } from '@/services/plain';
import { emptyDailyEntry, experimentAppliesToDate, type DailyBlockId, type DailyEntry } from '@/types';
import type { useAppStore } from '@/stores/app';
import {
  prepareDailyEntryForSave,
  DailyEntryChangedError,
  normalizeWeight,
  snapshotDailyEntry,
  timeBetween,
  validateDailyEntryMetrics,
  validateDailyEntryText,
  type DailyEntryMetrics,
} from './model';
import { setSyncEditorDirty } from '../sync/editing';
import { captureDailySave } from './telemetry';

type AppStore = ReturnType<typeof useAppStore>;

export function useDailyEntryForm(store: AppStore) {
  const router = getCurrentInstance()?.appContext.config.globalProperties.$router as Router | undefined;
  const localToday = ref(todayKey());
  function dateFromQuery(value: unknown) {
    const date = validDate(value);
    return date && date <= localToday.value ? date : localToday.value;
  }
  const selectedDate = ref(dateFromQuery(new URLSearchParams(window.location.search).get('date')));
  const sleepDurationMinutes = ref<number | null>(null);
  const timeInBedDurationMinutes = ref<number | null>(null);
  const weightKg = ref('');
  const saved = ref(false);
  const saving = ref(false);
  const draftStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const restoredDraft = ref(false);
  const draftConflict = ref(false);
  const validationMessage = ref('');
  const originalEntrySnapshot = ref('');
  const persistedDraftSnapshot = ref('');
  const conflictingSavedEntry = ref<DailyEntry | null>(null);
  const form = reactive<DailyEntry>(emptyDailyEntry(selectedDate.value));
  let syncingEntry = false;
  let lastDerivedTimeInBed: number | null = null;
  let savedTimer: number | undefined;
  let draftTimer: number | undefined;
  let draftSavePromise: Promise<boolean> | null = null;
  let saveOperation: Promise<void> | undefined;
  let midnightTimer: number | undefined;
  let expectedVersion: string | null = null;

  const activeDailyBlocks = computed(() => new Set(store.settings.activeDailyBlocks));
  const hasSavedEntry = computed(() => Boolean(store.entryByDate(selectedDate.value)));
  const currentEntrySnapshot = computed(() => snapshotDailyEntry(form, currentMetrics()));
  const isDirty = computed(() => currentEntrySnapshot.value !== originalEntrySnapshot.value);
  const entryChangeNotice = computed(() => {
    if (saved.value) {
      return '';
    }
    if (draftStatus.value === 'error') {
      return 'Не удалось защитить черновик. Сохраните день, прежде чем закрывать страницу.';
    }
    if (isDirty.value && draftStatus.value === 'saving') {
      return 'Сохраняю черновик на этом устройстве…';
    }
    if (isDirty.value && draftStatus.value === 'saved') {
      return restoredDraft.value
        ? 'Восстановлены несохранённые изменения. Черновик хранится только на этом устройстве.'
        : 'Черновик сохранён на этом устройстве. Чтобы добавить день в историю, нажмите «Сохранить день».';
    }
    if (isDirty.value && hasSavedEntry.value) {
      return `Есть изменения за ${formatDate(selectedDate.value, { day: 'numeric', month: 'long' })}. Сохрани, чтобы обновить запись.`;
    }
    if (isDirty.value) {
      return `Есть несохранённая запись за ${formatDate(selectedDate.value, { day: 'numeric', month: 'long' })}.`;
    }
    return '';
  });
  const saveButtonText = computed(() => {
    if (saving.value) {
      return 'Сохраняю…';
    }
    if (hasSavedEntry.value && isDirty.value) {
      return 'Сохранить изменения';
    }
    if (hasSavedEntry.value) {
      return 'Запись сохранена';
    }
    return 'Сохранить день';
  });
  const saveButtonDisabled = computed(() => draftConflict.value || saving.value || (hasSavedEntry.value && !isDirty.value && !saved.value));

  function currentMetrics(): DailyEntryMetrics {
    return {
      sleepMinutes: sleepDurationMinutes.value,
      timeInBedMinutes: timeInBedDurationMinutes.value,
      weightKg: weightKg.value,
    };
  }

  function applyEntry(entry: DailyEntry) {
    syncingEntry = true;
    Object.assign(form, plainCopy(entry));
    sleepDurationMinutes.value = entry.sleepMinutes;
    timeInBedDurationMinutes.value = entry.timeInBedMinutes;
    weightKg.value = entry.weightKg === null ? '' : String(entry.weightKg);
    syncingEntry = false;
    lastDerivedTimeInBed = null;
  }

  function currentDraftEntry(): DailyEntry {
    return plainCopy({
      ...form,
      sleepMinutes: sleepDurationMinutes.value,
      timeInBedMinutes: timeInBedDurationMinutes.value,
      weightKg: normalizeWeight(weightKg.value),
    });
  }

  function loadEntry(date: string) {
    validationMessage.value = '';
    restoredDraft.value = false;
    draftConflict.value = false;
    conflictingSavedEntry.value = null;
    draftStatus.value = 'idle';
    persistedDraftSnapshot.value = '';
    const existing = store.entryByDate(date);
    expectedVersion = existing?.updatedAt ?? null;
    const savedEntry = existing ?? { ...emptyDailyEntry(date), updatedAt: '' };
    applyEntry(savedEntry);
    originalEntrySnapshot.value = snapshotDailyEntry(form, currentMetrics());
    const draft = store.draftByDate(date);
    if (draft) {
      const savedEntryChanged = Boolean(existing) && draft.entry.updatedAt !== savedEntry.updatedAt;
      applyEntry(draft.entry);
      const draftSnapshot = snapshotDailyEntry(form, currentMetrics());
      if (draftSnapshot !== originalEntrySnapshot.value) {
        if (savedEntryChanged) {
          draftConflict.value = true;
          conflictingSavedEntry.value = plainCopy(savedEntry);
        }
        persistedDraftSnapshot.value = draftSnapshot;
        draftStatus.value = 'saved';
        restoredDraft.value = true;
      } else {
        void store.removeDailyEntryDraft(date);
      }
    }
    saved.value = false;
  }

  function blockIsActive(block: DailyBlockId) {
    return activeDailyBlocks.value.has(block);
  }

  function confirmDiscardChanges(): boolean {
    if (!isDirty.value || persistedDraftSnapshot.value === currentEntrySnapshot.value) {
      return true;
    }
    return window.confirm('Черновик ещё не сохранён на устройстве. Отбросить изменения и продолжить?');
  }

  async function changeSelectedDate(date: string) {
    if (validDate(date) !== date || date > localToday.value) {
      return false;
    }
    if (router) {
      const route = router.currentRoute.value;
      await router.replace({ path: route.path, query: { ...route.query, date }, hash: route.hash });
    } else if (confirmDiscardChanges()) {
      selectedDate.value = date;
    }
    return selectedDate.value === date;
  }

  async function selectDate(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!(await changeSelectedDate(input.value))) {
      input.value = selectedDate.value;
    }
  }

  function refreshLocalDate() {
    window.clearTimeout(midnightTimer);
    const day = todayKey();
    if (day !== localToday.value) {
      const followsToday = selectedDate.value === localToday.value && !router?.currentRoute.value.query.date;
      localToday.value = day;
      if (followsToday && !isDirty.value && !saving.value) {
        selectedDate.value = day;
      } else if (followsToday && router) {
        void changeSelectedDate(selectedDate.value);
      }
    }
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    midnightTimer = window.setTimeout(refreshLocalDate, Math.max(1, midnight.getTime() - Date.now()));
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty.value || persistedDraftSnapshot.value === currentEntrySnapshot.value) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }

  function handleCloudSnapshotApplied() {
    if (!isDirty.value) {
      void loadEntry(selectedDate.value);
    }
  }

  function queueDraftSave() {
    if (draftTimer !== undefined) {
      window.clearTimeout(draftTimer);
    }
    draftStatus.value = 'saving';
    draftTimer = window.setTimeout(() => void persistDraft(), 500);
  }

  async function persistDraft() {
    while (draftSavePromise) {
      await draftSavePromise;
      if (!isDirty.value || persistedDraftSnapshot.value === currentEntrySnapshot.value) {
        return true;
      }
    }
    if (draftTimer !== undefined) {
      window.clearTimeout(draftTimer);
      draftTimer = undefined;
    }
    if (!isDirty.value) {
      return true;
    }
    const snapshot = currentEntrySnapshot.value;
    draftStatus.value = 'saving';
    const operation = (async () => {
      try {
        await store.saveDailyEntryDraft(currentDraftEntry());
        if (currentEntrySnapshot.value === snapshot) {
          persistedDraftSnapshot.value = snapshot;
          draftStatus.value = 'saved';
        } else {
          queueDraftSave();
        }
        return true;
      } catch {
        draftStatus.value = 'error';
        console.warn('Не удалось сохранить черновик дневной записи');
        return false;
      }
    })();
    draftSavePromise = operation;
    try {
      return await operation;
    } finally {
      if (draftSavePromise === operation) {
        draftSavePromise = null;
      }
    }
  }

  function save() {
    saveOperation ??= saveCurrentEntry().finally(() => {
      saveOperation = undefined;
    });
    return saveOperation;
  }

  async function saveCurrentEntry() {
    if (draftConflict.value) {
      notifyError('Сначала выберите, какую версию записи оставить.');
      return;
    }
    validationMessage.value = validateDailyEntryMetrics(currentMetrics(), blockIsActive('sleep')) || validateDailyEntryText(form);
    if (validationMessage.value) {
      notifyError(validationMessage.value);
      return;
    }
    const entry = prepareDailyEntryForSave(
      form,
      currentMetrics(),
      {
        focusTitle: store.settings.activeFocusTitle,
        focusOutcomeCriterion: store.settings.focusOutcomeCriterion,
        focusReviewDate: store.settings.focusReviewDate,
        externalEvidenceCriterion: store.settings.externalEvidenceCriterion,
        nutritionCriterion: store.settings.nutritionGoalCriterion,
        experimentId: experimentAppliesToDate(store.settings.experiment, selectedDate.value) ? store.settings.experiment.id || null : null,
        activeDailyBlocks: store.settings.activeDailyBlocks,
      },
      !hasSavedEntry.value,
    );
    const submittedDraft = currentDraftEntry();
    const submittedSnapshot = currentEntrySnapshot.value;
    const wasExistingEntry = expectedVersion !== null;
    const recordSave = captureDailySave(entry, store.dailyEntries, wasExistingEntry);
    saving.value = true;
    try {
      if (draftSavePromise) {
        await draftSavePromise;
      }
      if (draftTimer !== undefined) {
        window.clearTimeout(draftTimer);
        draftTimer = undefined;
      }
      const savedEntry = await store.saveEntry(entry, expectedVersion);
      recordSave();
      const changedWhileSaving = currentEntrySnapshot.value !== submittedSnapshot;
      const currentWeight = weightKg.value;
      const currentDraft = currentDraftEntry();
      const nextEntry = plainCopy(savedEntry);
      if (changedWhileSaving) {
        for (const key of Object.keys(currentDraft) as Array<keyof DailyEntry>) {
          if (JSON.stringify(currentDraft[key]) !== JSON.stringify(submittedDraft[key])) {
            Object.assign(nextEntry, { [key]: currentDraft[key] });
          }
        }
      }
      applyEntry(nextEntry);
      if (changedWhileSaving && normalizeWeight(currentWeight) === null && currentWeight.trim()) {
        weightKg.value = currentWeight;
      }
      expectedVersion = savedEntry.updatedAt;
      originalEntrySnapshot.value = snapshotDailyEntry(savedEntry, savedEntry);
      persistedDraftSnapshot.value = '';
      draftStatus.value = 'idle';
      restoredDraft.value = false;
      saved.value = !isDirty.value;
      if (isDirty.value) {
        await persistDraft();
      }
      const localSaveMessage = wasExistingEntry
        ? `Запись за ${formatDate(selectedDate.value, { day: 'numeric', month: 'long' })} обновлена на устройстве`
        : 'День сохранён на устройстве';
      notifySaved(localSaveMessage);
      if (savedTimer !== undefined) {
        window.clearTimeout(savedTimer);
      }
      savedTimer = window.setTimeout(() => (saved.value = false), 2200);
    } catch (error) {
      if (error instanceof DailyEntryChangedError) {
        conflictingSavedEntry.value = error.current ?? { ...emptyDailyEntry(selectedDate.value), updatedAt: '' };
        draftConflict.value = true;
      } else {
        notifyUnknownError(error, 'Не удалось сохранить день');
      }
      await persistDraft();
    } finally {
      saving.value = false;
    }
  }

  async function resolveDraftConflict(useDraft: boolean) {
    const source = conflictingSavedEntry.value;
    if (!draftConflict.value || !source) {
      return;
    }
    if (!useDraft) {
      try {
        await store.removeDailyEntryDraft(selectedDate.value);
        applyEntry(source);
        originalEntrySnapshot.value = snapshotDailyEntry(form, currentMetrics());
        persistedDraftSnapshot.value = '';
        draftStatus.value = 'idle';
        restoredDraft.value = false;
      } catch (error) {
        notifyUnknownError(error, 'Не удалось удалить локальный черновик');
        return;
      }
    } else {
      form.updatedAt = source.updatedAt;
      void persistDraft();
    }
    expectedVersion = source.updatedAt || null;
    draftConflict.value = false;
    conflictingSavedEntry.value = null;
  }

  watch(selectedDate, loadEntry, { immediate: true });
  watch(isDirty, (dirty) => setSyncEditorDirty('daily-entry', dirty), { immediate: true });
  watch(
    currentEntrySnapshot,
    (snapshot) => {
      if (syncingEntry) {
        return;
      }
      saved.value = false;
      if (snapshot === originalEntrySnapshot.value) {
        if (draftTimer !== undefined) {
          window.clearTimeout(draftTimer);
        }
        draftTimer = undefined;
        persistedDraftSnapshot.value = '';
        draftStatus.value = 'idle';
        restoredDraft.value = false;
        void store.removeDailyEntryDraft(selectedDate.value);
        return;
      }
      queueDraftSave();
    },
    { flush: 'sync' },
  );
  watch(
    () => [form.bedtime, form.wakeTime],
    ([bedtime, wakeTime]) => {
      if (syncingEntry) {
        return;
      }
      const duration = timeBetween(String(bedtime), String(wakeTime));
      if (duration !== null) {
        timeInBedDurationMinutes.value = duration;
        lastDerivedTimeInBed = duration;
        return;
      }
      if (lastDerivedTimeInBed !== null && timeInBedDurationMinutes.value === lastDerivedTimeInBed) {
        timeInBedDurationMinutes.value = null;
      }
      lastDerivedTimeInBed = null;
    },
    { flush: 'sync' },
  );

  if (router) {
    onBeforeRouteUpdate(async (to) => {
      await saveOperation;
      const date = dateFromQuery(to.query.date);
      if (date === selectedDate.value) {
        return true;
      }
      if (!(await persistDraft()) && !confirmDiscardChanges()) {
        return false;
      }
      return true;
    });
    watch(
      router.currentRoute,
      (route) => {
        if (route.path === '/today') {
          selectedDate.value = dateFromQuery(route.query.date);
        }
      },
      { flush: 'sync' },
    );
    onBeforeRouteLeave(async () => {
      await saveOperation;
      if (!isDirty.value || persistedDraftSnapshot.value === currentEntrySnapshot.value) {
        return true;
      }
      return (await persistDraft()) || confirmDiscardChanges();
    });
  }
  onMounted(() => {
    refreshLocalDate();
    window.addEventListener('focus', refreshLocalDate);
    document.addEventListener('visibilitychange', refreshLocalDate);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('trajectory:cloud-snapshot-applied', handleCloudSnapshotApplied);
  });
  onBeforeUnmount(() => {
    window.clearTimeout(midnightTimer);
    window.removeEventListener('focus', refreshLocalDate);
    document.removeEventListener('visibilitychange', refreshLocalDate);
    setSyncEditorDirty('daily-entry', false);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('trajectory:cloud-snapshot-applied', handleCloudSnapshotApplied);
    if (savedTimer !== undefined) {
      window.clearTimeout(savedTimer);
    }
    if (draftTimer !== undefined) {
      window.clearTimeout(draftTimer);
    }
  });

  return {
    selectedDate,
    localToday,
    isToday: computed(() => selectedDate.value === localToday.value),
    sleepDurationMinutes,
    timeInBedDurationMinutes,
    weightKg,
    saved,
    saving,
    draftStatus,
    restoredDraft,
    draftConflict,
    validationMessage,
    form,
    hasSavedEntry,
    isDirty,
    entryChangeNotice,
    saveButtonText,
    saveButtonDisabled,
    blockIsActive,
    changeSelectedDate,
    selectDate,
    resolveDraftConflict,
    save,
  };
}
