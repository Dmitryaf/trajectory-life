import { describe, expect, it, vi } from 'vitest';
import { clearFirstUseFunnel } from '../funnel';

describe('legacy funnel cleanup', () => {
  it('removes the old store without reading or uploading it', () => {
    const storage = { removeItem: vi.fn(), getItem: vi.fn(), setItem: vi.fn() };
    clearFirstUseFunnel(storage);
    expect(storage.removeItem).toHaveBeenCalledWith('trajectory:first-use-funnel:v1');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('does not block deletion when storage is unavailable', () => {
    expect(() =>
      clearFirstUseFunnel({
        removeItem() {
          throw new Error('storage');
        },
      }),
    ).not.toThrow();
  });
});
