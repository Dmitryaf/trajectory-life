import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch, type InjectionKey, type Ref } from 'vue';
import { todayKey } from '@/services/dates';
import type { useAppStore } from '@/stores/app';
import { readDismissedReviews, reviewReminders, writeDismissedReviews, type DismissedReviews, type ReviewReminder } from './reminders';

const reminderKey: InjectionKey<ReturnType<typeof provideReviewReminders>> = Symbol('review-reminders');

export function provideReviewReminders(store: ReturnType<typeof useAppStore>, owner: Readonly<Ref<string>>, ready: Readonly<Ref<boolean>>) {
  const today = ref(todayKey());
  const dismissed = ref<DismissedReviews>({});
  watch(
    owner,
    (value) => {
      dismissed.value = value ? readDismissedReviews(value) : {};
    },
    { immediate: true, flush: 'sync' },
  );
  const reminders = computed(() => (ready.value && owner.value ? reviewReminders(store, today.value, dismissed.value) : []));

  function dismiss({ period, start }: ReviewReminder) {
    if (!reminders.value.some((reminder) => reminder.period === period && reminder.start === start)) {
      return;
    }
    dismissed.value = { ...dismissed.value, [period]: start };
    writeDismissedReviews(owner.value, dismissed.value);
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
  const context = { today, reminders, dismiss };
  provide(reminderKey, context);
  return context;
}

export function useReviewReminders() {
  return inject(reminderKey, null);
}
