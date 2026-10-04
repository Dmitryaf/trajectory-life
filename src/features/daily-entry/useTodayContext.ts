import { computed, type ComputedRef } from 'vue';
import { shouldShowAiAnalysisNudge } from '@/features/analysis/discovery';
import { entriesForPeriod, entriesForWeek, summarize } from '@/features/analytics/periodSummary';
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek, todayKey } from '@/services/dates';
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
      isWeekReviewWindow.value &&
      currentWeekSummary.value.ordinaryCoveredEntriesCount >= 4 &&
      currentWeekSummary.value.ordinaryCoreEntriesCount >= 2 &&
      !store.reviewByWeek(startOfWeek(todayKey()))
        ? {
            id: 'week',
            title: 'Неделя готова к разбору',
            text: `${currentWeekSummary.value.ordinaryCoveredEntriesCount} заполненных дней уже достаточно для короткого обзора.`,
            to: '/week',
            label: 'Открыть неделю',
          }
        : null,
      isMonthReviewWindow.value &&
      currentMonthSummary.value.ordinaryCoveredEntriesCount >= 12 &&
      currentMonthSummary.value.ordinaryCoreEntriesCount >= 6 &&
      !store.reviewByMonth(startOfMonth(todayKey()))
        ? {
            id: 'month',
            title: 'Месяц готов к разбору',
            text: `${currentMonthSummary.value.ordinaryCoveredEntriesCount} заполненных дней дают материал для месячного обзора.`,
            to: '/month',
            label: 'Открыть месяц',
          }
        : null,
    ].filter((item): item is { id: string; title: string; text: string; to: string; label: string } => item !== null),
  );
  const activeReviewReminder = computed(() => reviewReminders.value[0] ?? null);
  const currentWeeklyPlan = computed(() => store.reviewByWeek(startOfWeek(todayKey()))?.ifThenPlan.trim() ?? '');
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
