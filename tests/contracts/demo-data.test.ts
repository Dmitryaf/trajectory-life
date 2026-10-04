import { describe, expect, it } from 'vitest';
import { buildDemoPayload, DEMO_BACKUP_VERSION } from '../../scripts/generate-test-user-data.mjs';
import { normalizeSnapshot } from '@/features/backup/snapshot';
import { BACKUP_VERSION } from '@/features/backup/version';
import { SETTINGS_VERSION } from '@/model/dataVersions';
import { currentDailyEntrySchemaVersion } from '@/model/schema';
import { normalizeDailyEntry, normalizeLifeEvent, normalizeSettings } from '@/types';

const anchor = '2026-08-11';

describe('test user generator', () => {
  it('uses the current import schema and creates deterministic relative dates', () => {
    const first = normalizeSnapshot(buildDemoPayload(anchor));
    const second = normalizeSnapshot(buildDemoPayload(anchor));
    const settings = normalizeSettings(first.settings);

    expect(first).toEqual(second);
    expect(DEMO_BACKUP_VERSION).toBe(BACKUP_VERSION);
    expect(first.version).toBe(BACKUP_VERSION);
    expect(first.exportedAt.slice(0, 10)).toBe(anchor);
    expect(settings.settingsVersion).toBe(SETTINGS_VERSION);
    expect(settings.firstUse).toMatchObject({ status: 'completed', lastStep: 'overview', overviewSeen: true });
    expect(settings.focusReviewDate > anchor).toBe(true);
    expect(settings.experiment.startDate <= anchor).toBe(true);
    expect(settings.experiment.endDate > anchor).toBe(true);
    expect(settings.experimentHistory).toHaveLength(1);
    expect(settings.experimentHistory[0]!.endDate < settings.experiment.startDate).toBe(true);
  });

  it('covers high-volume UI, history, and experiment-note scenarios', () => {
    const fixture = normalizeSnapshot(buildDemoPayload(anchor));
    const entries = fixture.dailyEntries.map(normalizeDailyEntry);

    expect(entries.length).toBeGreaterThanOrEqual(40);
    expect(entries.some((entry) => entry.careerStates.length > 1)).toBe(true);
    expect(entries.some((entry) => entry.contextFactors.includes('anxiety_overload'))).toBe(true);
    expect(entries.some((entry) => entry.specialDay !== null)).toBe(true);
    expect(entries.some((entry) => entry.experimentNote.trim().length > 0)).toBe(true);
    expect(entries.some((entry) => entry.experimentCompleted === true)).toBe(true);
    expect(entries.some((entry) => entry.experimentCompleted === false)).toBe(true);
    expect(entries.every((entry) => entry.entrySchemaVersion === currentDailyEntrySchemaVersion)).toBe(true);
    expect(entries.filter((entry) => entry.experimentCompleted !== null).every((entry) => entry.experimentId)).toBe(true);
    expect(entries.every((entry) => entry.activeDailyBlocksSnapshot?.includes('context'))).toBe(true);
    expect(fixture.results.length).toBeGreaterThan(20);
    expect(fixture.lifeEvents).toHaveLength(10);
    expect(fixture.weeklyReviews.length).toBeGreaterThanOrEqual(8);
    expect(fixture.monthlyReviews?.length).toBeGreaterThanOrEqual(3);
  });

  it('does not create future observations or removed event values', () => {
    const fixture = normalizeSnapshot(buildDemoPayload(anchor));
    expect(fixture.dailyEntries.every((entry) => entry.date <= anchor)).toBe(true);
    expect(fixture.dailyEntries.filter((entry) => entry.weightKg !== null).every((entry) => entry.date <= anchor)).toBe(true);
    const events = (fixture.lifeEvents ?? []).map(normalizeLifeEvent);
    expect(events.every((event) => event.date <= anchor)).toBe(true);
    expect(events.every((event) => event.type !== 'milestone')).toBe(true);
  });

  it('does not reuse owner-specific vocabulary and rejects invalid anchors', () => {
    const serialized = JSON.stringify(buildDemoPayload(anchor)).toLocaleLowerCase('ru-RU');
    for (const fragment of ['резюме', 'ваканси', 'отклик', 'интервью', 'личн', 'английск', 'бокс', 'бачат', 'gpt', 'codex']) {
      expect(serialized).not.toContain(fragment);
    }
    expect(() => buildDemoPayload('2026-02-30')).toThrow(/календарной датой/);
  });
});
