import { db } from '@/db';
import { normalizeSnapshot, type ExportPayload } from '../backup/snapshot';

export async function loadCloudSyncBase(userId: string): Promise<{ revision: number; snapshot: ExportPayload } | null> {
  const value = await db.cloudSyncBases.get(userId);
  if (!value) {
    return null;
  }
  try {
    return { revision: value.revision, snapshot: normalizeSnapshot(value.snapshot) };
  } catch {
    await db.cloudSyncBases.delete(userId);
    return null;
  }
}

export async function saveCloudSyncBase(userId: string, revision: number, snapshot: unknown) {
  const normalized = normalizeSnapshot(snapshot);
  await db.cloudSyncBases.put({ userId, revision, snapshot: normalized });
}

export async function clearCloudSyncBases() {
  await db.cloudSyncBases.clear();
}
