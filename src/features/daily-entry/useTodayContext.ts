import { computed, type ComputedRef } from 'vue';
import { shouldShowAiAnalysisNudge } from '@/features/analysis/discovery';
import { entriesForPeriod, entriesForWeek, summarize } from '@/features/analytics/periodSummary';
import { addDays, endOfMonth, endOfWeek, formatDate, startOfMonth, startOfWeek, todayKey } from '@/services/dates';
import { externalCareerIdsForOptions } from '@/types';
import type { useAppStore } from '@/stores/app';

type AppStore = ReturnType<typeof useAppStore>;

export function useTodayContext(store: AppStore, isToday: ComputedRef<boolean>) {
  const currentWeekEntries = computed(() => entriesForWeek(store.dailyEntries, todayKey()));
  const externalCareerIds = computed(() => externalCareerIdsForOptions(store.settings.customCareerOptions));
  const currentWeekSummary = computed(() => summarize(currentWeekEntries.value, externalCareerIds.value));
  const currentMonthEntries = computed(() => entriesForPeriod(store.dailyEntries, startOfMonth(todayKey()), endOfMonth(todayKey())));
  const currentMonthSummary = computed(() => summarize(currentMonthEntries.value, externalCareerIds.value));
  const isWeekReviewWindow = computed(() => isToday.value && todayKey() >= addDays(endOfWeek(todayKey()), -1));
  const isMonthReviewWindow = computed(() => isToday.value && todayKey() >= addDays(endOfMonth(todayKey()), -2));
  const reviewReminders = computed(() =>
    [
      isWeekReviewWindow.value && currentWeekSummary.value.coveredEntriesCount > 0 && !store.reviewByWeek(startOfWeek(todayKey()))
        ? {
            id: 'week',
            title: 'Можно вспомнить неделю',
            text: 'Вернитесь к записям и при желании сохраните то, что заметили. Заполнять все поля не нужно.',
            to: '/week',
            label: 'Открыть неделю',
          }
        : null,
      isMonthReviewWindow.value && currentMonthSummary.value.coveredEntriesCount > 0 && !store.reviewByMonth(startOfMonth(todayKey()))
        ? {
            id: 'month',
            title: 'Можно вспомнить месяц',
            text: 'Записи помогут вспомнить важное. При желании сохраните свои выводы.',
            to: '/month',
            label: 'Открыть месяц',
          }
        : null,
    ].filter((item): item is { id: string; title: string; text: string; to: string; label: string } => item !== null),
  );
  const activeReviewReminder = computed(() => reviewReminders.value[0] ?? null);
  const currentWeeklyPlan = computed(() => {
    const sourceWeek = addDays(startOfWeek(todayKey()), -7);
    return {
      plan: store.reviewByWeek(sourceWeek)?.ifThenPlan.trim() ?? '',
      period: `${formatDate(startOfWeek(todayKey()), { day: 'numeric', month: 'short' })}–${formatDate(endOfWeek(todayKey()), { day: 'numeric', month: 'short' })}`,
      source: `/week?week=${sourceWeek}#week-review`,
    };
  });
  const yesterday = computed(() => addDays(todayKey(), -1));
  const yesterdayMissing = computed(
    () => isToday.value && store.loaded && store.dailyEntries.length > 0 && !store.entryByDate(yesterday.value),
  );
  const showAiAnalysisNudge = computed(
    () => isToday.value && store.loaded && shouldShowAiAnalysisNudge(store.dailyEntries, store.settings.aiAnalysisNudgeDismissed),
  );

  return {
    activeReviewReminder,
    currentWeekEntries,
    currentWeeklyPlan,
    currentWeekSummary,
    showAiAnalysisNudge,
    yesterday,
    yesterdayMissing,
  };
}
