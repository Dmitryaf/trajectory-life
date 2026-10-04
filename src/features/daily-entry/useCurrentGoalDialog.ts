import { ref } from 'vue';
import type { useAppStore } from '@/stores/app';
import { notifySaved, notifyUnknownError } from '@/services/notifications';

type AppStore = ReturnType<typeof useAppStore>;

export type CurrentGoalDraft = {
  title: string;
  outcomeCriterion: string;
  reviewDate: string;
  externalEvidenceCriterion: string;
};

export function useCurrentGoalDialog(store: Pick<AppStore, 'settings' | 'saveSettings'>) {
  const goalDialogOpen = ref(false);
  const goalSaving = ref(false);

  function openCurrentGoalDialog(): void {
    goalDialogOpen.value = true;
  }

  function closeCurrentGoalDialog(): void {
    if (!goalSaving.value) {
      goalDialogOpen.value = false;
    }
  }

  async function saveCurrentGoal(goal: CurrentGoalDraft, successMessage = 'Текущая цель сохранена'): Promise<void> {
    if (goalSaving.value) {
      return;
    }
    goalSaving.value = true;
    try {
      await store.saveSettings({
        ...store.settings,
        activeFocusTitle: goal.title,
        focusOutcomeCriterion: goal.outcomeCriterion,
        focusReviewDate: goal.reviewDate,
        externalEvidenceCriterion: goal.externalEvidenceCriterion,
      });
      goalDialogOpen.value = false;
      notifySaved(successMessage);
    } catch (error) {
      notifyUnknownError(error, 'Не удалось сохранить цель');
    } finally {
      goalSaving.value = false;
    }
  }

  async function removeCurrentGoal(): Promise<void> {
    await saveCurrentGoal({ title: '', outcomeCriterion: '', reviewDate: '', externalEvidenceCriterion: '' }, 'Текущая цель убрана');
  }

  return {
    goalDialogOpen,
    goalSaving,
    openCurrentGoalDialog,
    closeCurrentGoalDialog,
    saveCurrentGoal,
    removeCurrentGoal,
  };
}
