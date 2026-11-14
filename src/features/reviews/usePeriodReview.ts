import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue';
import { buildPeriodPackage, copyAiPrompt, downloadAiPackage } from '../export/browser';
import { addDays, addMonths, startOfMonth, startOfWeek, todayKey } from '@/services/dates';
import { notifyInfo, notifySaved, notifyUnknownError } from '@/services/notifications';
import { plainCopy } from '@/services/plain';
import { useAppStore } from '@/stores/app';
import type { MonthlyReview, WeeklyReview } from '@/types';
import { captureReviewSave } from './telemetry';
import { setSyncEditorDirty } from '../sync/editing';
import { ReviewChangedError } from './version';
import { useEditorDraft } from '../editor-drafts/useEditorDraft';
import { useViewedReview } from './useReviewReminders';

type Period = 'week' | 'month';
type PeriodReview = WeeklyReview | MonthlyReview;

type PeriodReviewOptions<T extends PeriodReview> = {
  period: Period;
  anchor: Ref<string>;
  start: Readonly<Ref<string>>;
  end: Readonly<Ref<string>>;
  emptyReview: (start: string) => T;
  findReview: (start: string) => T | undefined;
  persistReview: (review: T, expected: T | null, draftKey: string) => Promise<void>;
  hasContext: (review: T) => boolean;
  prepareDraft?: (review: T) => void;
  afterLoad?: () => void;
};

const periodLabels = {
  week: {
    saved: 'Обзор недели сохранён',
    saveError: 'Не удалось сохранить обзор недели',
    downloaded: 'Скачивание данных недели начато',
    downloadError: 'Не удалось скачать данные недели',
  },
  month: {
    saved: 'Итог месяца сохранён',
    saveError: 'Не удалось сохранить итог месяца',
    downloaded: 'Скачивание данных месяца начато',
    downloadError: 'Не удалось скачать данные месяца',
  },
} as const;

let nextEditorId = 0;

function draftSignature(review: PeriodReview) {
  return JSON.stringify({ ...review, updatedAt: '' });
}

export function usePeriodReview<T extends PeriodReview>(options: PeriodReviewOptions<T>) {
  useViewedReview(options.period, options.start);
  const store = useAppStore();
  const labels = periodLabels[options.period];
  const review = reactive(options.emptyReview(options.start.value)) as T;
  const reviewSaving = ref(false);
  const reviewConflict = ref(false);
  const editorId = `period-review:${++nextEditorId}`;
  const draftBaseline = ref('');
  let sourceBaseline: T | null = null;
  let loading = false;
  const dirty = computed(() => draftSignature(review) !== draftBaseline.value);
  const promptCopying = ref(false);
  const reviewContextOpen = ref(false);
  const savedReview = computed(() => options.findReview(options.start.value));
  const hasSavedReview = computed(() => Boolean(savedReview.value));
  const reviewHasContext = computed(() => options.hasContext(review));
  const currentPeriodStart = () => (options.period === 'week' ? startOfWeek(todayKey()) : startOfMonth(todayKey()));
  const availabilityLeadDays = options.period === 'week' ? 1 : 2;
  const reviewAvailable = computed(
    () =>
      hasSavedReview.value ||
      options.end.value < todayKey() ||
      (options.start.value === currentPeriodStart() && todayKey() >= addDays(options.end.value, -availabilityLeadDays)),
  );

  const drafts = useEditorDraft({
    reset: loadReview,
    key: computed(() => `${options.period}:${options.start.value}`),
    value: () => JSON.stringify(review),
    baseline: () => JSON.stringify(sourceBaseline),
    dirty,
    restore(value, baseline) {
      const restored = JSON.parse(value) as T;
      const periodKey = options.period === 'week' ? 'weekStart' : 'monthStart';
      if (!(periodKey in restored) || (restored as unknown as Record<string, unknown>)[periodKey] !== options.start.value) {
        throw new Error('Invalid draft');
      }
      sourceBaseline = JSON.parse(baseline) as T | null;
      Object.assign(review, restored);
    },
  });

  function loadReview() {
    loading = true;
    drafts.suspended.value = true;
    const existing = options.findReview(options.start.value);
    sourceBaseline = existing ? plainCopy(existing) : null;
    Object.assign(review, options.emptyReview(options.start.value), existing ? plainCopy(existing) : {});
    options.prepareDraft?.(review);
    options.afterLoad?.();
    draftBaseline.value = draftSignature(review);
    drafts.suspended.value = false;
    drafts.restore();
    reviewContextOpen.value = reviewHasContext.value;
    reviewConflict.value = dirty.value && JSON.stringify(savedReview.value ?? null) !== JSON.stringify(sourceBaseline);
    loading = false;
    setSyncEditorDirty(editorId, dirty.value);
  }

  watch(options.start, loadReview, { immediate: true });
  watch(
    dirty,
    (value) => {
      if (!loading) {
        setSyncEditorDirty(editorId, value);
      }
    },
    { flush: 'sync' },
  );
  watch(
    savedReview,
    () => {
      if (reviewSaving.value) {
        return;
      }
      if (!dirty.value) {
        loadReview();
      } else {
        reviewConflict.value = JSON.stringify(savedReview.value ?? null) !== JSON.stringify(sourceBaseline);
      }
    },
    { deep: true, flush: 'sync' },
  );
  async function changePeriod(anchor: string) {
    const nextStart = options.period === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
    if (nextStart === options.start.value || (await drafts.beforeLeave())) {
      options.anchor.value = anchor;
    }
  }
  function shiftPeriod(offset: number) {
    void changePeriod(options.period === 'week' ? addDays(options.anchor.value, offset * 7) : addMonths(options.start.value, offset));
  }
  onBeforeUnmount(() => setSyncEditorDirty(editorId, false));
  async function reloadReview() {
    if (await drafts.discard()) {
      loadReview();
    }
  }

  function updateReviewContextOpen(event: Event) {
    reviewContextOpen.value = (event.currentTarget as HTMLDetailsElement).open;
  }

  async function saveReview() {
    if (reviewSaving.value) {
      return;
    }
    reviewSaving.value = true;
    await drafts.flush();
    if (!drafts.currentOwner()) {
      reviewSaving.value = false;
      return;
    }
    drafts.suspended.value = true;
    const savingStart = options.start.value;
    const prepared = plainCopy(review);
    const recordSave = captureReviewSave(prepared, savedReview.value);
    try {
      await options.persistReview(prepared, sourceBaseline, `${options.period}:${savingStart}`);
      drafts.saved(JSON.stringify(prepared));
      if (options.start.value === savingStart) {
        sourceBaseline = savedReview.value ? plainCopy(savedReview.value) : prepared;
        draftBaseline.value = draftSignature(prepared);
        reviewConflict.value = false;
        if (!dirty.value) {
          loadReview();
        }
      }
      recordSave();
      notifySaved(labels.saved);
    } catch (error) {
      if (error instanceof ReviewChangedError) {
        if (options.start.value === savingStart) {
          reviewConflict.value = true;
          try {
            await store.load();
          } catch {
            /* Keep the local draft on read failure. */
          }
        }
      } else {
        notifyUnknownError(error, labels.saveError);
      }
    } finally {
      reviewSaving.value = false;
      drafts.suspended.value = false;
      await drafts.flush();
    }
  }

  async function replaceReview() {
    sourceBaseline = savedReview.value ? plainCopy(savedReview.value) : null;
    await saveReview();
  }

  function createPackage() {
    return buildPeriodPackage(options.period, options.anchor.value, {
      entries: store.dailyEntries,
      results: store.results,
      lifeEvents: store.lifeEvents,
      reviews: store.weeklyReviews,
      monthlyReviews: store.monthlyReviews,
      settings: store.settings,
    });
  }

  async function copyPrompt() {
    if (promptCopying.value) {
      return;
    }
    promptCopying.value = true;
    try {
      await copyAiPrompt(createPackage(), store.settings);
      notifySaved('Текст для нейросети скопирован');
    } catch (error) {
      notifyUnknownError(error, 'Не удалось подготовить текст для нейросети');
    } finally {
      promptCopying.value = false;
    }
  }

  function downloadJson() {
    try {
      downloadAiPackage(createPackage());
      notifyInfo(labels.downloaded);
    } catch (error) {
      notifyUnknownError(error, labels.downloadError);
    }
  }

  return {
    navigation: {
      previous: () => shiftPeriod(-1),
      next: () => shiftPeriod(1),
      current: () => changePeriod(todayKey()),
    },
    actions: reactive({
      saving: reviewSaving,
      conflict: reviewConflict,
      save: saveReview,
      reload: reloadReview,
      replace: replaceReview,
      notice: drafts.notice,
      draftError: drafts.error,
      retryDraft: drafts.flush,
    }),
    copyPrompt,
    downloadJson,
    hasSavedReview,
    promptCopying,
    review,
    reviewAvailable,
    reviewContextOpen,
    reviewHasContext,
    reviewSaving,
    reviewConflict,
    loadReview,
    replaceReview,
    saveReview,
    savedReview,
    updateReviewContextOpen,
  };
}
