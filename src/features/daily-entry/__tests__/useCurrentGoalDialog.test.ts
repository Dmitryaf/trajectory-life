import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifySaved, notifyUnknownError } from '@/services/notifications';
import { useAppStore } from '@/stores/app';
import { defaultSettings } from '@/types';
import { useCurrentGoalDialog, type CurrentGoalDraft } from '../useCurrentGoalDialog';

vi.mock('@/services/notifications', () => ({
  notifySaved: vi.fn(),
  notifyUnknownError: vi.fn(),
}));

const goal: CurrentGoalDraft = {
  title: 'Проверить гипотезу',
  outcomeCriterion: 'Получены пять интервью',
  reviewDate: '2026-09-30',
  externalEvidenceCriterion: 'Есть три повторных использования',
};

function createStore() {
  setActivePinia(createPinia());
  const store = useAppStore();
  store.settings = structuredClone(defaultSettings);
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('useCurrentGoalDialog', () => {
  it('saves the goal once and keeps the dialog locked until saving finishes', async () => {
    const store = createStore();
    let finishSaving!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      finishSaving = resolve;
    });
    const saveSettings = vi.spyOn(store, 'saveSettings').mockReturnValue(pendingSave);
    const dialog = useCurrentGoalDialog(store);

    dialog.openCurrentGoalDialog();
    const firstSave = dialog.saveCurrentGoal(goal);
    const duplicateSave = dialog.saveCurrentGoal(goal);
    dialog.closeCurrentGoalDialog();

    expect(dialog.goalSaving.value).toBe(true);
    expect(dialog.goalDialogOpen.value).toBe(true);
    expect(saveSettings).toHaveBeenCalledOnce();
    await duplicateSave;

    finishSaving();
    await firstSave;

    expect(saveSettings).toHaveBeenCalledWith({
      ...defaultSettings,
      activeFocusTitle: goal.title,
      focusOutcomeCriterion: goal.outcomeCriterion,
      focusReviewDate: goal.reviewDate,
      externalEvidenceCriterion: goal.externalEvidenceCriterion,
    });
    expect(dialog.goalSaving.value).toBe(false);
    expect(dialog.goalDialogOpen.value).toBe(false);
    expect(notifySaved).toHaveBeenCalledWith('Текущая цель сохранена');
  });

  it('keeps the dialog open and reports an unsuccessful save', async () => {
    const store = createStore();
    const error = new Error('Хранилище недоступно');
    vi.spyOn(store, 'saveSettings').mockRejectedValue(error);
    const dialog = useCurrentGoalDialog(store);

    dialog.openCurrentGoalDialog();
    await dialog.saveCurrentGoal(goal);

    expect(dialog.goalDialogOpen.value).toBe(true);
    expect(dialog.goalSaving.value).toBe(false);
    expect(notifyUnknownError).toHaveBeenCalledWith(error, 'Не удалось сохранить цель');
  });

  it('removes all current-goal fields with a dedicated confirmation', async () => {
    const store = createStore();
    const saveSettings = vi.spyOn(store, 'saveSettings').mockResolvedValue(undefined);
    const dialog = useCurrentGoalDialog(store);

    dialog.openCurrentGoalDialog();
    await dialog.removeCurrentGoal();

    expect(saveSettings).toHaveBeenCalledWith({
      ...defaultSettings,
      activeFocusTitle: '',
      focusOutcomeCriterion: '',
      focusReviewDate: '',
      externalEvidenceCriterion: '',
    });
    expect(dialog.goalDialogOpen.value).toBe(false);
    expect(notifySaved).toHaveBeenCalledWith('Текущая цель убрана');
  });
});
