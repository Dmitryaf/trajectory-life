import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useAppStore } from '@/stores/app';
import { emptyDailyEntry } from '@/types';

const storageProtection = vi.hoisted(() => ({
  check: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@/services/storageProtection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storageProtection')>();
  return {
    ...actual,
    checkStoragePersistence: storageProtection.check,
    requestStoragePersistence: storageProtection.request,
  };
});

describe('local storage protection integration', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    setActivePinia(createPinia());
    storageProtection.check.mockReset().mockResolvedValue('best-effort');
    storageProtection.request.mockReset().mockResolvedValue('persisted');
  });

  afterAll(async () => {
    await db.delete();
  });

  it('checks persistence while loading without blocking local data', async () => {
    const store = useAppStore();

    await store.load();
    await vi.waitFor(() => expect(store.storagePersistenceStatus).toBe('best-effort'));

    expect(storageProtection.check).toHaveBeenCalledOnce();
    expect(storageProtection.request).not.toHaveBeenCalled();
    expect(store.loaded).toBe(true);
  });

  it('requests persistence once after a successful meaningful write', async () => {
    const store = useAppStore();

    await store.saveEntry(emptyDailyEntry('2026-08-19'));
    await store.saveEntry(emptyDailyEntry('2026-08-20'));
    await vi.waitFor(() => expect(store.storagePersistenceStatus).toBe('persisted'));

    expect(storageProtection.request).toHaveBeenCalledOnce();
    expect(await db.dailyEntries.count()).toBe(2);
  });

  it('keeps a successful local write when the persistence request is denied', async () => {
    storageProtection.request.mockResolvedValue('best-effort');
    const store = useAppStore();

    await expect(store.saveEntry(emptyDailyEntry('2026-08-20'))).resolves.toBeDefined();
    await vi.waitFor(() => expect(store.storagePersistenceStatus).toBe('best-effort'));

    expect(store.entryByDate('2026-08-20')).toBeDefined();
    expect(await db.dailyEntries.get('2026-08-20')).toBeDefined();
  });

  it('does not report a failed quota write as saved and succeeds on retry', async () => {
    const store = useAppStore();
    const put = vi.spyOn(db.dailyEntries, 'put').mockRejectedValueOnce(new DOMException('Storage is full', 'QuotaExceededError'));

    await expect(store.saveEntry(emptyDailyEntry('2026-08-20'))).rejects.toMatchObject({
      name: 'LocalStorageQuotaError',
      message: expect.stringContaining('Изменения не сохранены'),
    });
    expect(store.entryByDate('2026-08-20')).toBeUndefined();
    expect(storageProtection.request).not.toHaveBeenCalled();

    put.mockRestore();
    await expect(store.saveEntry(emptyDailyEntry('2026-08-20'))).resolves.toBeDefined();
    expect(store.entryByDate('2026-08-20')).toBeDefined();
  });
});
