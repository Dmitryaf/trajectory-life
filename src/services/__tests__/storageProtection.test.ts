import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_STORAGE_QUOTA_MESSAGE,
  LocalStorageQuotaError,
  checkStoragePersistence,
  isStorageQuotaError,
  requestStoragePersistence,
  runStorageWrite,
} from '../storageProtection';

describe('storage protection', () => {
  it('checks an already persistent storage without requesting it again', async () => {
    const storage = { persisted: vi.fn().mockResolvedValue(true), persist: vi.fn() };

    await expect(checkStoragePersistence(storage)).resolves.toBe('persisted');
    await expect(requestStoragePersistence(storage)).resolves.toBe('persisted');

    expect(storage.persisted).toHaveBeenCalledTimes(2);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('reports a denied persistence request as best-effort storage', async () => {
    const storage = { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) };

    await expect(requestStoragePersistence(storage)).resolves.toBe('best-effort');
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it('keeps missing and failing Storage APIs non-blocking', async () => {
    await expect(checkStoragePersistence(undefined)).resolves.toBe('unsupported');
    await expect(requestStoragePersistence({ persisted: vi.fn().mockRejectedValue(new Error('blocked')) })).resolves.toBe('unsupported');
    await expect(requestStoragePersistence({ persisted: vi.fn().mockRejectedValue(new Error('blocked')), persist: vi.fn() })).resolves.toBe(
      'error',
    );
  });

  it('recognizes direct and wrapped browser quota errors', () => {
    const quota = new DOMException('Storage is full', 'QuotaExceededError');
    const wrapped = Object.assign(new Error('Dexie write failed'), { inner: quota });

    expect(isStorageQuotaError(quota)).toBe(true);
    expect(isStorageQuotaError(wrapped)).toBe(true);
    expect(isStorageQuotaError(new Error('IndexedDB unavailable'))).toBe(false);
  });

  it('turns a quota failure into an actionable error and allows a retry', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new DOMException('Storage is full', 'QuotaExceededError'))
      .mockResolvedValueOnce('saved');

    await expect(runStorageWrite(operation)).rejects.toMatchObject({
      name: 'LocalStorageQuotaError',
      message: LOCAL_STORAGE_QUOTA_MESSAGE,
    } satisfies Partial<LocalStorageQuotaError>);
    await expect(runStorageWrite(operation)).resolves.toBe('saved');
  });
});
