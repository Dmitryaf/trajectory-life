// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveCloudSyncMeta } from '../cloudSync';

afterEach(() => vi.restoreAllMocks());

describe('cloud sync metadata', () => {
  it('does not turn an unavailable localStorage marker into a failed cloud write', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException('Storage unavailable', 'QuotaExceededError');
      }),
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => saveCloudSyncMeta('user-1', { conflict: true, lastCloudRevision: 3 }, storage)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith('Не удалось сохранить состояние облачной синхронизации');
  });
});
