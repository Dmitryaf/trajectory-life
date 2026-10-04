import { markCloudSyncSynced, type CloudSnapshot } from '@/services/cloudSync';
import type { useAppStore } from '@/stores/app';
import { saveCloudSyncBase } from './base';
import { CloudOperationCancelledError, type CloudOperationScope } from '@/services/cloudOperation';
import { serializeLocalData } from './localData';
import { announceCloudSnapshotApplied } from './events';
import { hasUnsavedSyncEditors } from './editing';

type AppStore = ReturnType<typeof useAppStore>;

type ApplyCloudSnapshotServices = {
  markSynced: (userId: string, cloudUpdatedAt: string, cloudRevision?: number) => unknown;
  scope?: CloudOperationScope;
};

const defaultServices: ApplyCloudSnapshotServices = {
  markSynced: markCloudSyncSynced,
};

export async function applyCloudSnapshot(
  store: AppStore,
  userId: string,
  snapshot: CloudSnapshot,
  message: string,
  services: ApplyCloudSnapshotServices = defaultServices,
) {
  const scope = services.scope ?? store.createCloudOperationScope();
  scope.assertCurrent();
  if (scope.userId !== userId || snapshot.userId !== userId) {
    throw new CloudOperationCancelledError();
  }
  const expectedLocal = JSON.stringify({ ...store.exportData(), exportedAt: '' });
  await serializeLocalData(store, scope.assertCurrent, async () => {
    if (hasUnsavedSyncEditors()) {
      return;
    }
    if (JSON.stringify({ ...store.exportData(), exportedAt: '' }) !== expectedLocal) {
      throw new Error('Локальная запись изменилась во время сверки. Облако будет проверено повторно.');
    }
    await store.importLocalData(snapshot.payload, { syncCloud: false, preserveDailyDrafts: true }, scope);
    scope.assertCurrent();
    const revision = snapshot.revision ?? 1;
    await saveCloudSyncBase(userId, revision, snapshot.payload);
    scope.assertCurrent();
    services.markSynced(userId, snapshot.updatedAt, revision);
    store.setCloudSyncState('synced', `${message}: ${formatCloudUpdatedAt(snapshot.updatedAt)}`, {
      updatedAt: snapshot.updatedAt,
    });
    announceCloudSnapshotApplied();
  });
}

export function formatCloudUpdatedAt(value: string) {
  return new Date(value).toLocaleString('ru-RU');
}
