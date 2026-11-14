import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useAppStore } from '@/stores/app';
import { emptyWeeklyReview, emptyMonthlyReview } from '@/types';

const result = { id: 1, date: '2026-11-12', area: 'career' as const, title: 'Первый текст', note: '', createdAt: '2026-11-12T12:00:00Z' };
const draft = { key: 'result:1', value: '{"note":"Мой черновик"}', baseline: JSON.stringify(result), updatedAt: '2026-11-12T13:00:00Z' };

beforeEach(async () => {
  await db.delete();
  await db.open();
  setActivePinia(createPinia());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe('editor draft persistence', () => {
  it('rejects a stale journal edit using the persisted version even when store state is old', async () => {
    const store = useAppStore();
    await db.results.put(result);
    await store.load();
    await db.results.put({ ...result, note: 'Более свежий текст другого редактора' });
    await expect(store.updateResult({ ...result, title: 'Мой заголовок' }, result)).rejects.toMatchObject({ name: 'JournalChangedError' });
    expect((await db.results.get(1))?.note).toBe('Более свежий текст другого редактора');
  });

  it('reloads drafts without including their content in backup or saved records', async () => {
    const store = useAppStore();
    await store.saveEditorDraft(draft);
    store.unload();
    await store.load();
    expect(store.editorDraftByKey(draft.key)).toEqual(draft);
    expect(JSON.stringify(store.exportData())).not.toContain('Мой черновик');
    expect(store.results).toEqual([]);
  });

  it('preserves local drafts during cloud replacement but clears them on explicit import', async () => {
    const store = useAppStore();
    await store.saveEditorDraft(draft);
    const backup = store.exportData();
    await store.importData(backup, { preserveDailyDrafts: true });
    expect(store.editorDraftByKey(draft.key)).toEqual(draft);
    await store.importData(backup);
    expect(store.editorDraftByKey(draft.key)).toBeUndefined();
    expect(await db.editorDrafts.count()).toBe(0);
  });

  it('clears drafts with the account data and prevents an old owner from queued writes', async () => {
    const store = useAppStore();
    await store.saveEditorDraft(draft);
    await store.clearAll({ syncCloud: false });
    expect(await db.editorDrafts.count()).toBe(0);
    const saving = store.saveEditorDraft(draft);
    store.unload();
    await expect(saving).rejects.toMatchObject({ name: 'CloudOperationCancelledError' });
    expect(await db.editorDrafts.count()).toBe(0);
  });

  it('rejects a delayed draft from before an explicit import', async () => {
    const store = useAppStore();
    const generation = store.editorDraftGeneration;
    await store.importData(store.exportData());
    await expect(store.saveEditorDraft(draft, generation)).rejects.toMatchObject({ name: 'CloudOperationCancelledError' });
    expect(await db.editorDrafts.count()).toBe(0);
  });

  it('restores an externally deleted record only with the explicitly accepted absent version', async () => {
    const store = useAppStore();
    await db.results.put(result);
    await store.load();
    await db.results.delete(result.id);
    await expect(store.updateResult({ ...result, note: 'Мой текст' }, result)).rejects.toMatchObject({ name: 'JournalChangedError' });
    await store.load();
    await store.updateResult({ ...result, note: 'Мой текст' }, null);
    expect(store.results[0]?.note).toBe('Мой текст');
    expect((await db.results.get(result.id))?.note).toBe('Мой текст');
  });

  it('commits a journal save and draft removal together, preserving both on failure', async () => {
    const store = useAppStore();
    await db.results.put(result);
    await store.load();
    await store.saveEditorDraft(draft);
    const deletion = vi.spyOn(db.editorDrafts, 'delete').mockRejectedValueOnce(new Error('write failed'));
    await expect(store.updateResult({ ...result, note: 'Готовый текст' }, result, draft.key)).rejects.toThrow('write failed');
    expect((await db.results.get(1))?.note).toBe('');
    expect(await db.editorDrafts.get(draft.key)).toEqual(draft);
    deletion.mockRestore();
    await store.updateResult({ ...result, note: 'Готовый текст' }, result, draft.key);
    expect((await db.results.get(1))?.note).toBe('Готовый текст');
    expect(await db.editorDrafts.get(draft.key)).toBeUndefined();
    expect(store.editorDraftByKey(draft.key)).toBeUndefined();
  });

  it('removes a new journal draft only after adding its record', async () => {
    const store = useAppStore();
    await store.saveEditorDraft({ ...draft, key: 'event:new' });
    await store.addLifeEvent({ date: '2026-11-12', type: 'insight', title: 'Мысль', note: 'Полный текст' }, 'event:new');
    expect((await db.lifeEvents.toArray())[0]?.note).toBe('Полный текст');
    expect(await db.editorDrafts.get('event:new')).toBeUndefined();
  });

  it('keeps a stale review draft and removes successful week and month drafts', async () => {
    const store = useAppStore();
    const week = emptyWeeklyReview('2026-11-02');
    const month = emptyMonthlyReview('2026-10-01');
    await store.saveEditorDraft({ ...draft, key: 'week:2026-11-02' });
    await db.weeklyReviews.put({ ...week, support: 'Новая версия' });
    await expect(store.saveReview(week, null, 'week:2026-11-02')).rejects.toMatchObject({ name: 'ReviewChangedError' });
    expect(await db.editorDrafts.get('week:2026-11-02')).toBeDefined();
    await store.saveReview({ ...week, support: 'Мой вариант' }, await db.weeklyReviews.get(week.weekStart), 'week:2026-11-02');
    expect(await db.editorDrafts.get('week:2026-11-02')).toBeUndefined();
    await store.saveEditorDraft({ ...draft, key: 'month:2026-10-01' });
    await store.saveMonthlyReview(month, null, 'month:2026-10-01');
    expect(await db.editorDrafts.get('month:2026-10-01')).toBeUndefined();
  });

  it('upgrades an existing version 5 database without losing records', async () => {
    await db.delete();
    const previous = new Dexie('trajectory');
    previous.version(5).stores({
      dailyEntries: '&date, updatedAt, careerState',
      dailyEntryDrafts: '&date, updatedAt',
      results: '++id, date, area, createdAt',
      lifeEvents: '++id, date, type, createdAt',
      weeklyReviews: '&weekStart',
      monthlyReviews: '&monthStart',
      settings: '&id',
      cloudSyncBases: '&userId',
    });
    await previous.open();
    await previous.table('results').put(result);
    previous.close();
    await db.open();
    expect(await db.results.get(1)).toEqual(result);
    await db.editorDrafts.put(draft);
    expect(await db.editorDrafts.get(draft.key)).toEqual(draft);
  });
});
