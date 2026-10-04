import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasLocalUserData, prepareLocalCacheOwner, reconcileCloudSnapshotAfterResume, reconcileCloudSnapshotOnStartup } from '../startup';
import type { CloudSnapshot, CloudSyncMeta } from '@/services/cloudSync';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { setSyncEditorDirty } from '../editing';
import { defaultSettings, emptyDailyEntry } from '@/types';

vi.mock('../base', () => ({ loadCloudSyncBase: vi.fn(), saveCloudSyncBase: vi.fn() }));

const emptyMeta: CloudSyncMeta = {
  lastCloudUpdatedAt: '',
  lastCloudRevision: 0,
  lastSyncedAt: '',
  pending: false,
  conflict: false,
  error: '',
};

function createStore() {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.session = { user: { id: 'user-1' } } as typeof auth.session;
  const store = useAppStore();
  store.settings = structuredClone(defaultSettings);
  vi.spyOn(store, 'importLocalData').mockResolvedValue(undefined);
  vi.spyOn(store, 'syncCloudSnapshot').mockResolvedValue({ status: 'synced', updatedAt: '2026-07-22T10:00:00.000Z' });
  vi.spyOn(store, 'setCloudSyncState');
  vi.spyOn(store, 'clearAll').mockResolvedValue(undefined);
  return store;
}

function createServices(
  snapshot: CloudSnapshot | null,
  meta: Partial<CloudSyncMeta> = {},
  base: { revision: number; snapshot: unknown } | null = null,
) {
  return {
    loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    loadBase: vi.fn().mockResolvedValue(base),
    getMeta: vi.fn(() => ({ ...emptyMeta, ...meta })),
    markConflict: vi.fn(),
    markSynced: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('startup cloud reconciliation', () => {
  it.each([reconcileCloudSnapshotOnStartup, reconcileCloudSnapshotAfterResume])('discards a previous owner response', async (reconcile) => {
    const store = createStore();
    let finish!: (snapshot: CloudSnapshot) => void;
    const services = createServices(null);
    services.loadSnapshot.mockImplementationOnce(
      () =>
        new Promise<CloudSnapshot>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = reconcile(store, 'user-1', services);
    const auth = useAuthStore();
    auth.session = { user: { id: 'user-2' } } as typeof auth.session;
    finish({ payload: store.exportData(), userId: 'user-1', revision: 2, updatedAt: '2026-09-25T00:00:00.000Z' });
    await pending;
    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(services.markSynced).not.toHaveBeenCalled();
    expect(store.setCloudSyncState).not.toHaveBeenCalled();
  });

  it('defers a remote snapshot when the user starts editing during its request', async () => {
    const store = createStore();
    const services = createServices({ payload: store.exportData(), userId: 'user-1', revision: 2, updatedAt: '2026-09-25T00:00:00.000Z' });
    const pending = reconcileCloudSnapshotAfterResume(store, 'user-1', services);
    setSyncEditorDirty('test-review', true);
    try {
      await pending;
      expect(store.importLocalData).not.toHaveBeenCalled();
      expect(services.markSynced).not.toHaveBeenCalled();
    } finally {
      setSyncEditorDirty('test-review', false);
    }
  });

  it('restores cloud data into a genuinely empty local store', async () => {
    const store = createStore();
    const snapshot = { payload: { version: 3 }, updatedAt: '2026-07-22T10:00:00.000Z', userId: 'user-1', revision: 4 };
    const services = createServices(snapshot);

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.importLocalData).toHaveBeenCalledWith(
      snapshot.payload,
      {
        syncCloud: false,
        preserveDailyDrafts: true,
      },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(services.markSynced).toHaveBeenCalledWith('user-1', snapshot.updatedAt, 4);
  });

  it('applies the cloud snapshot automatically when there are no pending local changes', async () => {
    const store = createStore();
    store.settings.activeFocusTitle = 'Локальная цель';
    const snapshot = { payload: { version: 3 }, updatedAt: '2026-07-22T10:00:00.000Z', userId: 'user-1', revision: 2 };
    const services = createServices(snapshot, {}, { revision: 1, snapshot: store.exportData() });

    expect(hasLocalUserData(store)).toBe(true);
    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.importLocalData).toHaveBeenCalledWith(
      snapshot.payload,
      {
        syncCloud: false,
        preserveDailyDrafts: true,
      },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(services.markSynced).toHaveBeenCalledWith('user-1', snapshot.updatedAt, 2);
  });

  it('uploads pending local changes when the known cloud revision is unchanged', async () => {
    const store = createStore();
    const snapshot = { payload: {}, updatedAt: '2026-07-22T10:00:00.000+00:00', userId: 'user-1', revision: 3 };
    const services = createServices(snapshot, { lastCloudUpdatedAt: '2026-07-22T10:00:00.000Z', lastCloudRevision: 3, pending: true });

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.syncCloudSnapshot).toHaveBeenCalledWith({ force: true });
    expect(store.importLocalData).not.toHaveBeenCalled();
  });

  it('imports a newer known cloud revision before working screens mount', async () => {
    const store = createStore();
    store.dailyEntries = [emptyDailyEntry('2026-07-21')];
    const snapshot = { payload: { version: 3 }, updatedAt: '2026-07-22T10:00:00.000Z', userId: 'user-1', revision: 5 };
    const services = createServices(
      snapshot,
      { lastCloudUpdatedAt: '2026-07-21T10:00:00.000Z' },
      { revision: 4, snapshot: store.exportData() },
    );

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.importLocalData).toHaveBeenCalledWith(
      snapshot.payload,
      {
        syncCloud: false,
        preserveDailyDrafts: true,
      },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(services.markSynced).toHaveBeenCalledWith('user-1', snapshot.updatedAt, 5);
  });

  it('applies a newer cloud revision after resume without asking the user to refresh', async () => {
    const store = createStore();
    store.dailyEntries = [emptyDailyEntry('2026-07-21')];
    const snapshot = { payload: { version: 3 }, updatedAt: '2026-07-22T10:00:00.000Z', userId: 'user-1', revision: 6 };
    const services = createServices(
      snapshot,
      { lastCloudUpdatedAt: '2026-07-21T10:00:00.000Z' },
      { revision: 5, snapshot: store.exportData() },
    );

    await reconcileCloudSnapshotAfterResume(store, 'user-1', services);

    expect(store.importLocalData).toHaveBeenCalledWith(
      snapshot.payload,
      {
        syncCloud: false,
        preserveDailyDrafts: true,
      },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(services.markSynced).toHaveBeenCalledWith('user-1', snapshot.updatedAt, 6);
  });

  it('recognizes identical data regardless of the timestamp notation', async () => {
    const store = createStore();
    store.dailyEntries = [emptyDailyEntry('2026-07-21')];
    const snapshot = {
      payload: { ...store.exportData(), exportedAt: '2026-07-22T10:00:00.000Z' },
      updatedAt: '2026-07-22T10:00:00.000+00:00',
      userId: 'user-1',
      revision: 7,
    };
    const services = createServices(snapshot, { lastCloudUpdatedAt: '2026-07-22T10:00:00.000Z' });

    await reconcileCloudSnapshotAfterResume(store, 'user-1', services);

    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(services.markSynced).toHaveBeenCalledWith('user-1', snapshot.updatedAt, 7);
    expect(store.setCloudSyncState).toHaveBeenCalledWith('synced', expect.stringContaining('Облако синхронизировано:'), {
      updatedAt: snapshot.updatedAt,
    });
  });

  it('clears a stale conflict when local and cloud data are identical', async () => {
    const store = createStore();
    store.settings.activeFocusTitle = 'Одна и та же цель';
    const updatedAt = '2026-07-22T10:00:00.000+00:00';
    const snapshot = {
      payload: { ...store.exportData(), exportedAt: '2026-07-22T10:00:00.000Z' },
      updatedAt,
      userId: 'user-1',
      revision: 8,
    };
    const services = createServices(snapshot, { lastCloudUpdatedAt: updatedAt, conflict: true });

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(store.syncCloudSnapshot).not.toHaveBeenCalled();
    expect(services.markSynced).toHaveBeenCalledWith('user-1', updatedAt, 8);
    expect(store.setCloudSyncState).toHaveBeenCalledWith('synced', expect.stringContaining('Облако синхронизировано:'), {
      updatedAt,
    });
  });

  it('keeps local data when a known conflict still differs from the cloud snapshot', async () => {
    const store = createStore();
    store.settings.activeFocusTitle = 'Локальная цель';
    const updatedAt = '2026-07-22T10:00:00.000+00:00';
    const cloudPayload = {
      ...store.exportData(),
      settings: { ...store.settings, activeFocusTitle: 'Облачная цель' },
    };
    const snapshot = { payload: cloudPayload, updatedAt, userId: 'user-1', revision: 9 };
    const services = createServices(snapshot, { lastCloudUpdatedAt: updatedAt, conflict: true });

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(store.syncCloudSnapshot).not.toHaveBeenCalled();
    expect(services.markSynced).not.toHaveBeenCalled();
    expect(store.setCloudSyncState).toHaveBeenCalledWith(
      'conflict',
      'Локальная и облачная версии изменены по-разному. Автоматическая запись остановлена; обе версии сохранены.',
    );
  });

  it('keeps both versions when sync metadata and a trusted base are missing', async () => {
    const store = createStore();
    store.settings.activeFocusTitle = 'Локальная цель';
    const cloudPayload = {
      ...store.exportData(),
      settings: { ...store.settings, activeFocusTitle: 'Облачная цель' },
    };
    const snapshot = {
      payload: cloudPayload,
      updatedAt: '2026-07-22T10:00:00.000Z',
      userId: 'user-1',
      revision: 10,
    };
    const services = createServices(snapshot);

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(store.syncCloudSnapshot).not.toHaveBeenCalled();
    expect(services.markConflict).toHaveBeenCalledWith('user-1', snapshot.updatedAt, 10);
    expect(store.cloudConflictSnapshot).toEqual(snapshot);
  });

  it('reconciles through the guarded merge when local data changed after the stored base', async () => {
    const store = createStore();
    const baseSnapshot = JSON.parse(JSON.stringify(store.exportData()));
    store.settings.activeFocusTitle = 'Новая локальная цель';
    const snapshot = {
      payload: { version: 3 },
      updatedAt: '2026-07-22T10:00:00.000Z',
      userId: 'user-1',
      revision: 11,
    };
    const services = createServices(snapshot, {}, { revision: 9, snapshot: baseSnapshot });

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.syncCloudSnapshot).toHaveBeenCalledWith({ force: true });
    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(services.markSynced).not.toHaveBeenCalled();
  });

  it('keeps local data available when the cloud check fails', async () => {
    const store = createStore();
    const services = createServices(null);
    services.loadSnapshot.mockRejectedValue(new Error('network unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.setCloudSyncState).toHaveBeenCalledWith('pending', 'Локальные данные доступны. Облако пока не проверено.', {
      error: 'network unavailable',
    });
    expect(store.cloudSyncError).toBe('network unavailable');
    warning.mockRestore();
  });

  it('keeps a persisted conflict blocked when the cloud cannot be checked after reload', async () => {
    const store = createStore();
    const services = createServices(null, { conflict: true });
    services.loadSnapshot.mockRejectedValue(new Error('network unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await reconcileCloudSnapshotOnStartup(store, 'user-1', services);

    expect(store.setCloudSyncState).toHaveBeenCalledWith(
      'conflict',
      'Автозапись остановлена: для выбора между версиями нужно снова проверить облако.',
      { error: 'network unavailable' },
    );
    expect(store.importLocalData).not.toHaveBeenCalled();
    expect(store.syncCloudSnapshot).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it('clears a cache owned by another account before assigning the new owner', async () => {
    const store = createStore();
    const values = new Map([['trajectory:local-owner-id', 'user-old']]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    await prepareLocalCacheOwner(store, 'user-new', storage);

    expect(store.clearAll).toHaveBeenCalledWith({ syncCloud: false });
    expect(storage.setItem).toHaveBeenCalledWith('trajectory:local-owner-id', 'user-new');
  });
});
