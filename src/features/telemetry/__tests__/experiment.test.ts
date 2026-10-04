import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/stores/app';
import { useExperimentSettings } from '@/features/experiments/useExperimentSettings';
import type { AppSettings } from '@/types';

const emitted = vi.hoisted(() => vi.fn());
vi.mock('../productTelemetry', () => ({ captureProductEvent: () => emitted, productTelemetry: { clearDeletedAccount: vi.fn() } }));
describe('explicit experiment activation', () => {
  it('ignores failed saves, hydration and edits of an existing active experiment', async () => {
    setActivePinia(createPinia());
    const store = useAppStore();
    const settings = JSON.parse(JSON.stringify(store.settings)) as AppSettings;
    settings.experiment = { ...settings.experiment, active: true, title: 'PRIVATE', startDate: '2026-09-01', endDate: '2026-09-07' };
    const save = vi.fn(async (_message?: string, _action?: string, next?: AppSettings) => {
      store.settings = next!;
      return true;
    });
    save.mockResolvedValueOnce(false);
    const { saveExperiment } = useExperimentSettings(settings, () => false, save);
    expect(emitted).not.toHaveBeenCalled();
    await saveExperiment();
    expect(emitted).not.toHaveBeenCalled();
    await saveExperiment();
    expect(emitted).toHaveBeenCalledOnce();
    settings.experiment.endDate = '2026-09-10';
    await saveExperiment();
    expect(emitted).toHaveBeenCalledOnce();
  });
});
