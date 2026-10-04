import type { useAppStore } from '@/stores/app';
import { defaultSettings } from '@/types';
import { normalizeSnapshot, type ExportPayload } from '../backup/snapshot';
import {
  getCloudSyncMeta,
  loadCloudSnapshot,
  markCloudSyncConflict,
  markCloudSyncSynced,
  type CloudSnapshot,
  type CloudSyncMeta,
} from '@/services/cloudSync';
import { applyCloudSnapshot, formatCloudUpdatedAt } from './snapshot';
import { loadCloudSyncBase } from './base';
import { CloudOperationCancelledError, type CloudOperationScope } from '@/services/cloudOperation';
import { hasUnsavedSyncEditors } from './editing';

type AppStore = ReturnType<typeof useAppStore>;

type StartupSyncServices = {
  loadSnapshot: (scope?: CloudOperationScope) => Promise<CloudSnapshot | null>;
  loadBase: (userId: string) => Promise<{ revision: number; snapshot: ExportPayload } | null>;
  getMeta: (userId: string) => CloudSyncMeta;
  markConflict: (userId: string, cloudUpdatedAt: string, cloudRevision?: number) => unknown;
  markSynced: (userId: string, cloudUpdatedAt: string, cloudRevision?: number) => unknown;
};

const defaultServices: StartupSyncServices = {
  loadSnapshot: loadCloudSnapshot,
  loadBase: loadCloudSyncBase,
  getMeta: getCloudSyncMeta,
  markConflict: markCloudSyncConflict,
  markSynced: markCloudSyncSynced,
};

const localOwnerKey = 'trajectory:local-owner-id';

export async function reconcileCloudSnapshotOnStartup(
  store: AppStore,
  userId: string | null | undefined,
  services: StartupSyncServices = defaultServices,
) {
  await reconcileCloudSnapshot(store, userId, services);
}

export async function reconcileCloudSnapshotAfterResume(
  store: AppStore,
  userId: string | null | undefined,
  services: StartupSyncServices = defaultServices,
) {
  await reconcileCloudSnapshot(store, userId, services);
}

async function reconcileCloudSnapshot(store: AppStore, userId: string | null | undefined, services: StartupSyncServices) {
  if (!userId) {
    return;
  }

  let meta: CloudSyncMeta | null = null;
  const scope = store.createCloudOperationScope();
  try {
    if (scope.userId !== userId) {
      return;
    }
    meta = services.getMeta(userId);
    const snapshot = await services.loadSnapshot(scope);
    scope.assertCurrent();
    if (reconciliationDeferred(store)) {
      return;
    }
    meta = services.getMeta(userId);

    if (!snapshot) {
      if (hasLocalUserData(store) || meta.pending) {
        await store.syncCloudSnapshot({ force: true });
      } else {
        store.setCloudSyncState('synced', 'Облако пока пустое');
      }
      return;
    }

    if (sameSnapshotData(store, snapshot)) {
      await store.saveSyncBase(scope, snapshot, snapshot.revision ?? 1);
      scope.assertCurrent();
      if (reconciliationDeferred(store) || !sameSnapshotData(store, snapshot)) {
        return;
      }
      services.markSynced(userId, snapshot.updatedAt, snapshot.revision ?? 1);
      store.setCloudSyncState('synced', `Облако синхронизировано: ${formatCloudUpdatedAt(snapshot.updatedAt)}`, {
        updatedAt: snapshot.updatedAt,
      });
      return;
    }

    if (meta.conflict) {
      store.holdCloudConflict(snapshot);
      return;
    }

    if (meta.pending) {
      await store.syncCloudSnapshot({ force: true });
      return;
    }

    if (!hasLocalUserData(store)) {
      await applyCloudSnapshot(store, userId, snapshot, 'Загружена более свежая облачная копия', {
        markSynced: services.markSynced,
        scope,
      });
      return;
    }

    const base = await services.loadBase(userId);
    scope.assertCurrent();
    if (reconciliationDeferred(store)) {
      return;
    }
    if (!base) {
      services.markConflict(userId, snapshot.updatedAt, snapshot.revision ?? 1);
      store.holdCloudConflict(snapshot);
      return;
    }

    if (!samePayloadData(store.exportData(), base.snapshot)) {
      await store.syncCloudSnapshot({ force: true });
      return;
    }

    await applyCloudSnapshot(store, userId, snapshot, 'Загружена более свежая облачная копия', {
      markSynced: services.markSynced,
      scope,
    });
  } catch (error) {
    reportReconciliationFailure(store, scope, meta, error);
  }
}

function reconciliationDeferred(store: AppStore) {
  return hasUnsavedSyncEditors() || store.cloudSyncStatus === 'syncing';
}

function reportReconciliationFailure(store: AppStore, scope: CloudOperationScope, meta: CloudSyncMeta | null, error: unknown) {
  if (error instanceof CloudOperationCancelledError) {
    return;
  }
  try {
    scope.assertCurrent();
  } catch {
    return;
  }
  console.warn('Не удалось загрузить облачную копию');
  const conflict = Boolean(meta?.conflict);
  store.setCloudSyncState(
    conflict ? 'conflict' : 'pending',
    conflict
      ? 'Автозапись остановлена: для выбора между версиями нужно снова проверить облако.'
      : 'Локальные данные доступны. Облако пока не проверено.',
    { error: error instanceof Error ? error.message : 'Не удалось проверить облако' },
  );
}

export function sameSnapshotData(store: AppStore, snapshot: CloudSnapshot) {
  return samePayloadData(store.exportData(), snapshot.payload);
}

export function samePayloadData(leftInput: unknown, rightInput: unknown) {
  try {
    const left = { ...normalizeSnapshot(leftInput), exportedAt: '' };
    const right = { ...normalizeSnapshot(rightInput), exportedAt: '' };
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export async function prepareLocalCacheOwner(
  store: AppStore,
  userId: string | null | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
) {
  if (!userId) {
    return;
  }

  const localOwnerId = storage.getItem(localOwnerKey);
  if (localOwnerId && localOwnerId !== userId) {
    await store.clearAll({ syncCloud: false });
  }
  storage.setItem(localOwnerKey, userId);
}

export function hasLocalUserData(store: AppStore): boolean {
  return Boolean(
    store.dailyEntries.length ||
    store.results.length ||
    store.lifeEvents.length ||
    store.weeklyReviews.length ||
    store.monthlyReviews.length ||
    JSON.stringify(store.settings) !== JSON.stringify(defaultSettings),
  );
}
