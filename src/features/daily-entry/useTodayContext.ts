import { computed, type ComputedRef } from 'vue';
import { shouldShowAiAnalysisNudge } from '@/features/analysis/discovery';
import { addDays, endOfWeek, formatDate, startOfWeek, todayKey } from '@/services/dates';
import type { useAppStore } from '@/stores/app';

type AppStore = ReturnType<typeof useAppStore>;

export function useTodayContext(store: AppStore, isToday: ComputedRef<boolean>) {
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
    currentWeeklyPlan,
    showAiAnalysisNudge,
    yesterday,
    yesterdayMissing,
  };
}
