export type ResumeCloudRefreshState = {
  authenticated: boolean;
  loaded: boolean;
  status: 'disabled' | 'idle' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'error';
};

type ResumeCloudRefreshOptions = {
  minIntervalMs?: number;
  now?: () => number;
};

export function createResumeCloudRefresh(refresh: () => Promise<void>, options: ResumeCloudRefreshOptions = {}) {
  const minIntervalMs = options.minIntervalMs ?? 10_000;
  const now = options.now ?? Date.now;
  let lastStartedAt = 0;
  let inFlight: Promise<boolean> | null = null;

  return function requestRefresh(state: ResumeCloudRefreshState, force = false): Promise<boolean> {
    if (!state.authenticated || !state.loaded || state.status === 'disabled' || state.status === 'syncing') {
      return Promise.resolve(false);
    }
    if (inFlight) {
      return inFlight;
    }
    const startedAt = now();
    if (!force && startedAt - lastStartedAt < minIntervalMs) {
      return Promise.resolve(false);
    }

    lastStartedAt = startedAt;
    inFlight = refresh()
      .then(() => true)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
