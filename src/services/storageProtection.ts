export type StoragePersistenceStatus = 'unknown' | 'checking' | 'persisted' | 'best-effort' | 'unsupported' | 'error';

export type StoragePersistenceResult = Exclude<StoragePersistenceStatus, 'unknown' | 'checking'>;

type StorageManagerLike = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

type ErrorWithCause = Error & {
  cause?: unknown;
  inner?: unknown;
  code?: number;
};

export const LOCAL_STORAGE_QUOTA_MESSAGE =
  'Изменения не сохранены: на устройстве закончилось место. Ранее сохранённые записи остались. Освободите место и повторите сохранение. Для дополнительной копии используйте облако или экспорт JSON.';

export class LocalStorageQuotaError extends Error {
  constructor(cause?: unknown) {
    super(LOCAL_STORAGE_QUOTA_MESSAGE, { cause });
    this.name = 'LocalStorageQuotaError';
  }
}

function browserStorageManager(): StorageManagerLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  return navigator.storage;
}

export async function checkStoragePersistence(
  storage: StorageManagerLike | undefined = browserStorageManager(),
): Promise<StoragePersistenceResult> {
  if (typeof storage?.persisted !== 'function') {
    return 'unsupported';
  }
  try {
    return (await storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'error';
  }
}

export async function requestStoragePersistence(
  storage: StorageManagerLike | undefined = browserStorageManager(),
): Promise<StoragePersistenceResult> {
  if (typeof storage?.persisted !== 'function' || typeof storage.persist !== 'function') {
    return 'unsupported';
  }
  try {
    if (await storage.persisted()) {
      return 'persisted';
    }
    return (await storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'error';
  }
}

export function isStorageQuotaError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) {
      const candidate = current as ErrorWithCause;
      if (candidate.name === 'QuotaExceededError' || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        return true;
      }
      if (candidate.code === 22 || candidate.code === 1014) {
        return true;
      }
      current = candidate.cause ?? candidate.inner;
      continue;
    }
    break;
  }
  return false;
}

export function normalizeStorageWriteError(error: unknown): unknown {
  return isStorageQuotaError(error) ? new LocalStorageQuotaError(error) : error;
}

export async function runStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeStorageWriteError(error);
  }
}
