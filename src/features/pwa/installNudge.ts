export const pwaInstallNudgeStorageKey = 'trajectory:pwa-install-nudge-dismissed-until';
export const pwaInstallNudgeDelayMs = 30 * 24 * 60 * 60 * 1000;

export function readPwaInstallNudgeDismissedUntil(storage: Pick<Storage, 'getItem'> = window.localStorage): number {
  try {
    const value = Number(storage.getItem(pwaInstallNudgeStorageKey));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function postponePwaInstallNudge(now = Date.now(), storage: Pick<Storage, 'setItem'> = window.localStorage): number {
  const dismissedUntil = now + pwaInstallNudgeDelayMs;
  try {
    storage.setItem(pwaInstallNudgeStorageKey, String(dismissedUntil));
  } catch {
    // The current session can still hide the optional suggestion when storage is unavailable.
  }
  return dismissedUntil;
}

export function shouldShowPwaInstallNudge(options: {
  savedEntryCount: number;
  installed: boolean;
  platform: 'ios' | 'android' | 'other';
  dismissedUntil: number;
  now?: number;
}): boolean {
  const now = options.now ?? Date.now();
  return options.savedEntryCount >= 2 && !options.installed && options.platform !== 'other' && options.dismissedUntil <= now;
}
