import { reactive, ref } from 'vue';
import { addDays, todayKey } from '@/services/dates';
import { notifyError, notifyInfo, notifySaved, notifyUnknownError } from '@/services/notifications';
import { useAppStore } from '@/stores/app';
import { copyText, downloadJson } from '../export/browser';
import { buildAiReportCustomRangePayload, buildAiReportPayload, buildAiReportPrompt, type AiReportPeriod } from '../export/report';

type FixedAnalysisPeriod = Exclude<AiReportPeriod, 'range'>;

export function useExternalAnalysis() {
  const store = useAppStore();
  const start = ref(addDays(todayKey(), -30));
  const end = ref(todayKey());
  const maxDate = todayKey();
  const copyingActions = reactive(new Set<string>());

  function isCopying(action: string) {
    return copyingActions.has(action);
  }

  async function runCopy(action: string, fallback: string, operation: () => Promise<void>) {
    if (isCopying(action)) {
      return;
    }
    copyingActions.add(action);
    try {
      await operation();
    } catch (error) {
      notifyUnknownError(error, fallback);
    } finally {
      copyingActions.delete(action);
    }
  }

  async function copyPrompt(period: FixedAnalysisPeriod) {
    await runCopy(`analysis-${period}`, 'Не удалось подготовить текст для нейросети', async () => {
      const payload = createPayload(period);
      await copyText(buildAiReportPrompt(payload, store.settings));
      notifySaved('Текст для нейросети скопирован');
    });
  }

  function downloadData(period: FixedAnalysisPeriod) {
    try {
      const payload = createPayload(period);
      downloadJson(payload, `trajectory-analysis-${period}-${payload.start}-${payload.dataThrough}.json`);
      notifyInfo(period === 'week' ? 'Скачивание данных недели начато' : 'Скачивание данных месяца начато');
    } catch (error) {
      notifyUnknownError(error, 'Не удалось скачать данные для анализа');
    }
  }

  async function copyCustomPrompt() {
    if (!rangeIsValid()) {
      return;
    }
    await runCopy('analysis-range', 'Не удалось подготовить текст для нейросети', async () => {
      const payload = createCustomPayload();
      await copyText(buildAiReportPrompt(payload, store.settings));
      notifySaved('Текст выбранного периода скопирован');
    });
  }

  function downloadCustomData() {
    if (!rangeIsValid()) {
      return;
    }
    try {
      const payload = createCustomPayload();
      downloadJson(payload, `trajectory-analysis-period-${payload.start}-${payload.dataThrough}.json`);
      notifyInfo('Скачивание данных выбранного периода начато');
    } catch (error) {
      notifyUnknownError(error, 'Не удалось скачать данные для анализа');
    }
  }

  function createPayload(period: FixedAnalysisPeriod) {
    return buildAiReportPayload(period, todayKey(), analysisSource());
  }

  function createCustomPayload() {
    return buildAiReportCustomRangePayload(start.value, end.value, analysisSource());
  }

  function analysisSource() {
    return {
      entries: store.dailyEntries,
      results: store.results,
      lifeEvents: store.lifeEvents,
      reviews: store.weeklyReviews,
      monthlyReviews: store.monthlyReviews,
      settings: store.settings,
    };
  }

  function rangeIsValid() {
    if (!start.value || !end.value) {
      notifyError('Укажите начало и конец периода');
      return false;
    }
    if (start.value > end.value) {
      notifyError('Начало периода должно быть не позже окончания');
      return false;
    }
    if (end.value > todayKey()) {
      notifyError('Период анализа не может заканчиваться в будущем');
      return false;
    }
    return true;
  }

  return {
    copyCustomPrompt,
    copyPrompt,
    downloadCustomData,
    downloadData,
    end,
    isCopying,
    maxDate,
    start,
  };
}
