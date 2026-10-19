import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch, type InjectionKey, type Ref } from 'vue';
import { todayKey } from '@/services/dates';
import type { useAppStore } from '@/stores/app';
import { readViewedReviews, reviewReminders, writeViewedReviews, type ReviewPeriod, type ViewedReviews } from './reminders';

const reminderKey: InjectionKey<ReturnType<typeof provideReviewReminders>> = Symbol('review-reminders');

export function provideReviewReminders(store: ReturnType<typeof useAppStore>, owner: Readonly<Ref<string>>, ready: Readonly<Ref<boolean>>) {
  const today = ref(todayKey());
  const viewed = ref<ViewedReviews>({});
  watch(
    owner,
    (value) => {
      viewed.value = value ? readViewedReviews(value) : {};
    },
    { immediate: true, flush: 'sync' },
  );
  const reminders = computed(() => (ready.value && owner.value ? reviewReminders(store, today.value, viewed.value) : []));
  const destination = computed(() => reminders.value[0]?.to ?? '/week');
  const label = computed(() => reminders.value.map((reminder) => reminder.label).join('. '));

  function markViewed(period: ReviewPeriod, start: string) {
    if (!reminders.value.some((reminder) => reminder.period === period && reminder.start === start)) {
      return;
    }
    viewed.value = { ...viewed.value, [period]: start };
    writeViewedReviews(owner.value, viewed.value);
  }
  function refreshDate() {
    today.value = todayKey();
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    timer = setInterval(refreshDate, 60_000);
    window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', refreshDate);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    window.removeEventListener('focus', refreshDate);
    document.removeEventListener('visibilitychange', refreshDate);
  });
  const context = { reminders, destination, label, markViewed };
  provide(reminderKey, context);
  return context;
}

export function useReviewReminders() {
  return inject(reminderKey, null);
}

export function useViewedReview(period: ReviewPeriod, start: Readonly<Ref<string>>) {
  const context = useReviewReminders();
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  watch(
    () => [mounted.value, start.value, context?.reminders.value] as const,
    () => {
      if (mounted.value) {
        context?.markViewed(period, start.value);
      }
    },
    { flush: 'post' },
  );
}
