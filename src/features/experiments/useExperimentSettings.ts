import { computed } from 'vue';
import { todayKey } from '@/services/dates';
import { notifyError } from '@/services/notifications';
import { plainCopy } from '@/services/plain';
import { useAppStore } from '@/stores/app';
import type { AppSettings } from '@/types';
import { captureProductEvent } from '@/features/telemetry/productTelemetry';
import {
  createExperimentId,
  createExperimentRecord,
  emptyExperiment,
  experimentPeriodsOverlap,
  validateExperimentTextLengths,
} from './model';

type SaveSettings = (message?: string, action?: string, nextSettings?: AppSettings) => Promise<boolean>;

function startsExperiment(next: AppSettings['experiment'], previous: AppSettings['experiment']) {
  return next.active && (!previous.active || next.id !== previous.id);
}

export function useExperimentSettings(settings: AppSettings, isSaving: (action: string) => boolean, save: SaveSettings) {
  const store = useAppStore();
  const experimentCanConclude = computed(() =>
    Boolean(settings.experiment.startDate && settings.experiment.endDate && settings.experiment.startDate <= todayKey()),
  );
  const experimentIdentityLocked = computed(() => {
    const saved = store.settings.experiment;
    return Boolean(saved.active && saved.id && store.dailyEntries.some((entry) => entry.experimentId === saved.id));
  });
  const experimentSaveLabel = computed(() => {
    const saved = store.settings.experiment;
    return experimentIdentityLocked.value && settings.experiment.endDate > saved.endDate ? 'Продлить эксперимент' : 'Сохранить настройки';
  });

  function validateStartedExperimentChange(experiment: AppSettings['experiment']): string {
    if (!experimentIdentityLocked.value) {
      return '';
    }
    const saved = store.settings.experiment;
    if (experiment.id !== saved.id || experiment.title.trim() !== saved.title.trim() || experiment.startDate !== saved.startDate) {
      return 'После первой записи условие и дату начала нельзя менять. Завершите этот эксперимент и создайте новый.';
    }
    if (experiment.endDate < saved.endDate) {
      return 'Начавшийся эксперимент можно только продлить. Уже сохранённые дни останутся в текущем периоде.';
    }
    return '';
  }

  async function saveExperiment() {
    if (isSaving('experiment')) {
      return;
    }
    const nextSettings = plainCopy(settings);
    const experiment = nextSettings.experiment;
    if (experiment.active && !experiment.id) {
      experiment.id = createExperimentId();
    }
    const lengthError = validateExperimentTextLengths(experiment);
    if (lengthError) {
      notifyError(lengthError);
      return;
    }
    if (experiment.active && !experiment.title.trim()) {
      notifyError('Напишите, что хотите попробовать');
      return;
    }
    if (experiment.active && (!experiment.startDate || !experiment.endDate)) {
      notifyError('Укажите, с какого и до какого дня идёт эксперимент');
      return;
    }
    if (experiment.startDate && experiment.endDate && experiment.startDate > experiment.endDate) {
      notifyError('Дата окончания эксперимента должна быть не раньше даты начала');
      return;
    }
    const identityError = validateStartedExperimentChange(experiment);
    if (identityError) {
      notifyError(identityError);
      return;
    }
    if (experiment.active && settings.experimentHistory.some((record) => experimentPeriodsOverlap(experiment, record))) {
      notifyError('Период пересекается с завершённым экспериментом');
      return;
    }
    const extending = experimentIdentityLocked.value && experiment.endDate > store.settings.experiment.endDate;
    const starting = startsExperiment(experiment, store.settings.experiment);
    const recordStart = captureProductEvent('experiment_started', {});
    if (await save(extending ? 'Эксперимент продлён' : 'Эксперимент сохранён', 'experiment', nextSettings)) {
      Object.assign(settings, nextSettings);
      if (starting) {
        recordStart();
      }
    }
  }

  async function completeExperiment() {
    if (isSaving('experiment')) {
      return;
    }
    const nextSettings = plainCopy(settings);
    const experiment = nextSettings.experiment;
    if (!experiment.id) {
      experiment.id = createExperimentId();
    }
    const lengthError = validateExperimentTextLengths(experiment);
    if (lengthError) {
      notifyError(lengthError);
      return;
    }
    if (!experiment.title.trim() || !experiment.startDate || !experiment.endDate) {
      notifyError('Напишите, что пробовали, и укажите даты');
      return;
    }
    if (experiment.startDate > experiment.endDate) {
      notifyError('Дата окончания эксперимента должна быть не раньше даты начала');
      return;
    }
    const identityError = validateStartedExperimentChange(experiment);
    if (identityError) {
      notifyError(identityError);
      return;
    }
    const completionDate = todayKey();
    if (experiment.startDate > completionDate) {
      notifyError('Эксперимент ещё не начался');
      return;
    }
    if (!experiment.conclusion.trim()) {
      notifyError('Запишите, что вы заметили');
      return;
    }
    // Explicit completion closes the actual period; editing a running period still only allows extension.
    if (experiment.endDate > completionDate) {
      experiment.endDate = completionDate;
    }
    if (settings.experimentHistory.some((record) => experimentPeriodsOverlap(experiment, record))) {
      notifyError('Период пересекается с завершённым экспериментом');
      return;
    }
    nextSettings.experimentHistory.unshift(createExperimentRecord(experiment));
    nextSettings.experiment = emptyExperiment();
    if (await save('Эксперимент добавлен в историю', 'experiment', nextSettings)) {
      Object.assign(settings, nextSettings);
    }
  }

  return {
    completeExperiment,
    experimentCanConclude,
    experimentIdentityLocked,
    experimentSaveLabel,
    saveExperiment,
  };
}
