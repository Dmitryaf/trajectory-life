import { describe, expect, it } from 'vitest';
import { emptyDailyEntry, defaultSettings } from '@/types';
import { BACKUP_VERSION } from '@/features/backup/version';
import type { ExportPayload } from '@/features/backup/snapshot';
import { CloudMergeConflictError, mergeCloudSnapshots } from '../merge';

function emptyPayload(): ExportPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: '2026-08-20T10:00:00.000Z',
    dailyEntries: [],
    results: [],
    lifeEvents: [],
    weeklyReviews: [],
    monthlyReviews: [],
    settings: structuredClone(defaultSettings),
  };
}

describe('cloud snapshot merge', () => {
  it('merges independent self-reminders from two devices', () => {
    const base = { ...emptyPayload(), version: 11 };
    const started = { category: 'lesson', text: 'Один вывод', createdAt: '2026-08-20T10:00:00.000Z' };
    const local = { ...emptyPayload(), selfReminders: [{ ...started, id: 'left' }] };
    const remote = { ...emptyPayload(), selfReminders: [{ ...started, id: 'right', text: 'Другой вывод' }] };
    expect(mergeCloudSnapshots(base, local, remote).selfReminders).toEqual([...local.selfReminders, ...remote.selfReminders]);
  });

  it('protects a self-reminder edited on one device and removed on another', () => {
    const item = { id: 'one', category: 'principle', text: 'Исходный текст', createdAt: '2026-08-20T10:00:00.000Z' };
    const base = { ...emptyPayload(), selfReminders: [item] };
    const local = { ...base, selfReminders: [{ ...item, text: 'Новая редакция' }] };
    const remote = { ...base, selfReminders: [] };
    expect(() => mergeCloudSnapshots(base, local, remote)).toThrowError(
      expect.objectContaining({ conflicts: [{ path: 'selfReminders[one]', kind: 'edit_delete' }] }),
    );
  });

  it('keeps independent field edits made on two devices', () => {
    const entry = { ...emptyDailyEntry('2026-08-20'), energy: 3, importantFact: '' };
    const base = { ...emptyPayload(), dailyEntries: [entry] };
    const local = { ...base, dailyEntries: [{ ...entry, energy: 4 }] };
    const remote = { ...base, dailyEntries: [{ ...entry, importantFact: 'Изменение с телефона' }] };

    const merged = mergeCloudSnapshots(base, local, remote);

    expect(merged.dailyEntries[0]).toMatchObject({ energy: 4, importantFact: 'Изменение с телефона' });
  });

  it('merges independent settings fields', () => {
    const base = emptyPayload();
    const local = { ...base, settings: { ...base.settings, activeFocusTitle: 'Новая цель' } };
    const remote = { ...base, settings: { ...base.settings, focusOutcomeCriterion: 'Готовый результат' } };

    const merged = mergeCloudSnapshots(base, local, remote);

    expect(merged.settings.activeFocusTitle).toBe('Новая цель');
    expect(merged.settings.focusOutcomeCriterion).toBe('Готовый результат');
  });

  it('blocks two different edits to the same field', () => {
    const entry = { ...emptyDailyEntry('2026-08-20'), energy: 3 };
    const base = { ...emptyPayload(), dailyEntries: [entry] };
    const local = { ...base, dailyEntries: [{ ...entry, energy: 4 }] };
    const remote = { ...base, dailyEntries: [{ ...entry, energy: 2 }] };

    expect(() => mergeCloudSnapshots(base, local, remote)).toThrowError(
      expect.objectContaining<Partial<CloudMergeConflictError>>({
        conflicts: [{ path: 'dailyEntries[2026-08-20].energy', kind: 'both_changed' }],
      }),
    );
  });

  it('blocks an edit on one device when the other deleted the same entry', () => {
    const entry = { ...emptyDailyEntry('2026-08-20'), importantFact: 'Исходная запись' };
    const base = { ...emptyPayload(), dailyEntries: [entry] };
    const local = { ...base, dailyEntries: [] };
    const remote = { ...base, dailyEntries: [{ ...entry, importantFact: 'Изменение с телефона' }] };

    expect(() => mergeCloudSnapshots(base, local, remote)).toThrowError(
      expect.objectContaining<Partial<CloudMergeConflictError>>({
        conflicts: [{ path: 'dailyEntries[2026-08-20]', kind: 'edit_delete' }],
      }),
    );
  });

  it('blocks a local edit when the other device deleted the same entry', () => {
    const entry = { ...emptyDailyEntry('2026-08-20'), importantFact: 'Исходная запись' };
    const base = { ...emptyPayload(), dailyEntries: [entry] };
    const local = { ...base, dailyEntries: [{ ...entry, importantFact: 'Изменение с компьютера' }] };
    const remote = { ...base, dailyEntries: [] };

    expect(() => mergeCloudSnapshots(base, local, remote)).toThrowError(
      expect.objectContaining<Partial<CloudMergeConflictError>>({
        conflicts: [{ path: 'dailyEntries[2026-08-20]', kind: 'edit_delete' }],
      }),
    );
  });

  it('blocks different changes to an atomic settings list', () => {
    const base = emptyPayload();
    const local = { ...base, settings: { ...base.settings, activeLifeAreas: ['health'] } };
    const remote = { ...base, settings: { ...base.settings, activeLifeAreas: ['career'] } };

    expect(() => mergeCloudSnapshots(base, local, remote)).toThrowError(
      expect.objectContaining<Partial<CloudMergeConflictError>>({
        conflicts: [{ path: 'settings.activeLifeAreas', kind: 'both_changed' }],
      }),
    );
  });

  it('preserves two new journal records that received the same local id', () => {
    const base = emptyPayload();
    const local = {
      ...base,
      results: [{ id: 1, date: '2026-08-20', area: 'career', title: 'С компьютера', note: '', createdAt: '2026-08-20T10:00:00Z' }],
    };
    const remote = {
      ...base,
      results: [{ id: 1, date: '2026-08-20', area: 'health', title: 'С телефона', note: '', createdAt: '2026-08-20T10:01:00Z' }],
    };

    const merged = mergeCloudSnapshots(base, local, remote);

    expect(merged.results.map((record) => record.title).sort()).toEqual(['С компьютера', 'С телефона']);
    expect(new Set(merged.results.map((record) => record.id)).size).toBe(2);
  });
});
