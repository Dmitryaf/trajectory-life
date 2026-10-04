import { describe, expect, it, vi } from 'vitest';
import { createResumeCloudRefresh, type ResumeCloudRefreshState } from '../resume';

const readyState: ResumeCloudRefreshState = {
  authenticated: true,
  loaded: true,
  status: 'synced',
};

describe('resume cloud refresh', () => {
  it('coalesces simultaneous focus and visibility refreshes', async () => {
    let resolveRefresh!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => (resolveRefresh = resolve)));
    const requestRefresh = createResumeCloudRefresh(refresh, { now: () => 20_000 });

    const focusRefresh = requestRefresh(readyState);
    const visibilityRefresh = requestRefresh(readyState);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh();
    await expect(Promise.all([focusRefresh, visibilityRefresh])).resolves.toEqual([true, true]);
  });

  it('throttles repeated resume checks but allows an online retry', async () => {
    let time = 20_000;
    const refresh = vi.fn().mockResolvedValue(undefined);
    const requestRefresh = createResumeCloudRefresh(refresh, { minIntervalMs: 10_000, now: () => time });

    await expect(requestRefresh(readyState)).resolves.toBe(true);
    time += 1_000;
    await expect(requestRefresh(readyState)).resolves.toBe(false);
    await expect(requestRefresh(readyState, true)).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh before login, before loading, or while syncing', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const requestRefresh = createResumeCloudRefresh(refresh, { now: () => 20_000 });

    await requestRefresh({ ...readyState, authenticated: false });
    await requestRefresh({ ...readyState, loaded: false });
    await requestRefresh({ ...readyState, status: 'syncing' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rechecks a legacy conflict automatically', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const requestRefresh = createResumeCloudRefresh(refresh, { now: () => 20_000 });

    await expect(requestRefresh({ ...readyState, status: 'conflict' })).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
