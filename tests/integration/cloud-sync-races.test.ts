import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { saveCloudSyncBase } from '@/features/sync/base';
import { applyCloudSnapshot } from '@/features/sync/snapshot';
import { CloudRevisionConflictError, loadCloudSnapshot, saveCloudSnapshot, type CloudSnapshot } from '@/services/cloudSync';
import { plainCopy } from '@/services/plain';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { emptyWeeklyReview } from '@/types';

vi.mock('@/services/cloudSync', async (original) => ({
  ...(await original<typeof import('@/services/cloudSync')>()),
  isCloudSyncConfigured: () => true,
  getCloudSyncMeta: () => ({ lastCloudRevision: 1, conflict: false }),
  saveCloudSnapshot: vi.fn(),
  loadCloudSnapshot: vi.fn(),
  markCloudSyncPending: vi.fn(),
  markCloudSyncSynced: vi.fn(),
  markCloudSyncConflict: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  setActivePinia(createPinia());
  vi.resetAllMocks();
  const auth = useAuthStore();
  auth.session = { user: { id: 'owner-A' } } as typeof auth.session;
  vi.mocked(saveCloudSnapshot).mockImplementation(async (payload, revision, scope) => ({
    payload,
    revision: revision + 1,
    userId: scope!.userId!,
    updatedAt: '2026-09-25T00:00:00.000Z',
  }));
});
afterAll(async () => {
  await db.delete();
});

describe('cloud synchronization races', () => {
  it('does not apply a stale download over a save that was already queued locally', async () => {
    const store = useAppStore();
    vi.spyOn(store, 'syncCloudSnapshot').mockResolvedValue({ status: 'pending', error: 'offline' });
    const snapshot = { payload: store.exportData(), userId: 'owner-A', revision: 2, updatedAt: '2026-09-25T00:00:00.000Z' };
    const saving = store.saveSettings({ ...plainCopy(store.settings), activeFocusTitle: 'new queued edit' });
    const markSynced = vi.fn();
    const applying = applyCloudSnapshot(store, 'owner-A', snapshot, 'Downloaded', { markSynced });
    await expect(applying).rejects.toThrow('Локальная запись изменилась');
    await saving;
    expect((await db.settings.get('main'))?.activeFocusTitle).toBe('new queued edit');
    expect(store.settings.activeFocusTitle).toBe('new queued edit');
    expect(markSynced).not.toHaveBeenCalled();
  });

  it('preserves a newer saved setting when an older upload needs a merge', async () => {
    const store = useAppStore();
    const base = store.exportData();
    await saveCloudSyncBase('owner-A', 1, base);
    const request = deferred<CloudSnapshot>();
    vi.mocked(saveCloudSnapshot).mockImplementationOnce(() => request.promise);
    vi.mocked(loadCloudSnapshot).mockResolvedValue({
      payload: { ...base, settings: { ...base.settings, nutritionGoalCriterion: 'remote edit' } },
      revision: 2,
      userId: 'owner-A',
      updatedAt: '2026-09-25T00:00:00.000Z',
    });
    const pending = store.syncCloudSnapshot();
    await store.saveSettings({ ...plainCopy(store.settings), activeFocusTitle: 'new local edit' });
    request.reject(new CloudRevisionConflictError());
    await expect(pending).resolves.toMatchObject({ status: 'synced' });
    const expected = { activeFocusTitle: 'new local edit', nutritionGoalCriterion: 'remote edit' };
    expect(store.settings).toMatchObject(expected);
    expect(await db.settings.get('main')).toMatchObject(expected);
    expect(vi.mocked(saveCloudSnapshot).mock.calls.at(-1)![0]).toMatchObject({ settings: expected });
  });

  it('keeps a save submitted while the merged snapshot is being imported', async () => {
    const store = useAppStore();
    const base = store.exportData();
    await saveCloudSyncBase('owner-A', 1, base);
    const gate = deferred<void>();
    const entered = deferred<void>();
    const importLocal = store.importLocalData.bind(store);
    vi.spyOn(store, 'importLocalData').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await gate.promise;
      await importLocal(...args);
    });
    vi.mocked(saveCloudSnapshot).mockRejectedValueOnce(new CloudRevisionConflictError());
    vi.mocked(loadCloudSnapshot).mockResolvedValue({
      payload: { ...base, weeklyReviews: [{ ...emptyWeeklyReview('2026-09-21'), nextLever: 'remote review' }] },
      revision: 2,
      userId: 'owner-A',
      updatedAt: '2026-09-25T00:00:00.000Z',
    });
    const pending = store.syncCloudSnapshot();
    await entered.promise;
    const saving = store.saveSettings({ ...plainCopy(store.settings), activeFocusTitle: 'saved during import' });
    gate.resolve();
    await saving;
    await pending;
    expect((await db.settings.get('main'))?.activeFocusTitle).toBe('saved during import');
    expect(store.settings.activeFocusTitle).toBe('saved during import');
    expect(store.weeklyReviews[0]?.nextLever).toBe('remote review');
    expect(vi.mocked(saveCloudSnapshot).mock.calls.at(-1)![0]).toMatchObject({ settings: { activeFocusTitle: 'saved during import' } });
  });

  it.each(['success', 'conflict', 'network'] as const)('discards an old owner upload after switching accounts: %s', async (result) => {
    const store = useAppStore();
    store.settings.activeFocusTitle = 'private A';
    const request = deferred<CloudSnapshot>();
    vi.mocked(saveCloudSnapshot).mockImplementationOnce(() => request.promise);
    const payload = store.exportData();
    const pending = store.syncCloudSnapshot();
    store.unload();
    const auth = useAuthStore();
    auth.session = { user: { id: 'owner-B' } } as typeof auth.session;
    if (result === 'success') {
      request.resolve({ payload, revision: 2, userId: 'owner-A', updatedAt: '2026-09-25T00:00:00.000Z' });
    } else {
      request.reject(result === 'conflict' ? new CloudRevisionConflictError() : new Error('network'));
    }
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(loadCloudSnapshot).not.toHaveBeenCalled();
    expect(saveCloudSnapshot).toHaveBeenCalledOnce();
    expect(await db.cloudSyncBases.count()).toBe(0);
    expect(store.settings.activeFocusTitle).toBe('');
    expect(store.cloudSyncStatus).toBe('idle');
  });

  it('discards a conflict read when the session changes without an unload', async () => {
    const store = useAppStore();
    const base = store.exportData();
    await saveCloudSyncBase('owner-A', 1, base);
    const remote = deferred<CloudSnapshot>();
    vi.mocked(saveCloudSnapshot).mockRejectedValueOnce(new CloudRevisionConflictError());
    vi.mocked(loadCloudSnapshot).mockReturnValueOnce(remote.promise);
    const pending = store.syncCloudSnapshot();
    await vi.waitFor(() => expect(loadCloudSnapshot).toHaveBeenCalledOnce());
    const auth = useAuthStore();
    auth.session = { user: { id: 'owner-B' } } as typeof auth.session;
    remote.resolve({ payload: base, revision: 2, userId: 'owner-A', updatedAt: '2026-09-25T00:00:00.000Z' });
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(saveCloudSnapshot).toHaveBeenCalledOnce();
    expect((await db.cloudSyncBases.get('owner-A'))?.revision).toBe(1);
  });

  it('rejects a review whose source version changed before its queued save', async () => {
    const store = useAppStore();
    const old = emptyWeeklyReview('2026-09-21');
    const current = { ...old, nextLever: 'new remote review' };
    store.weeklyReviews = [current];
    await db.weeklyReviews.put(current);
    await expect(store.saveReview({ ...old, nextLever: 'stale form' }, old)).rejects.toThrow('Обзор изменился');
    expect((await db.weeklyReviews.get(old.weekStart))?.nextLever).toBe('new remote review');
    expect(saveCloudSnapshot).not.toHaveBeenCalled();
  });
});
