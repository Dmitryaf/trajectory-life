// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  postponePwaInstallNudge,
  pwaInstallNudgeDelayMs,
  pwaInstallNudgeStorageKey,
  readPwaInstallNudgeDismissedUntil,
  shouldShowPwaInstallNudge,
} from '../installNudge';

describe('PWA install suggestion', () => {
  beforeEach(() => window.localStorage.clear());

  it('appears only after repeated use and outside standalone mode', () => {
    const base = {
      platform: 'ios' as const,
      dismissedUntil: 0,
      now: 1_000,
    };

    expect(shouldShowPwaInstallNudge({ ...base, savedEntryCount: 1, installed: false })).toBe(false);
    expect(shouldShowPwaInstallNudge({ ...base, savedEntryCount: 2, installed: false })).toBe(true);
    expect(shouldShowPwaInstallNudge({ ...base, savedEntryCount: 2, installed: true })).toBe(false);
    expect(shouldShowPwaInstallNudge({ ...base, savedEntryCount: 2, installed: false, platform: 'other' })).toBe(false);
  });

  it('postpones the suggestion for thirty days', () => {
    const now = 1_000;
    const dismissedUntil = postponePwaInstallNudge(now);

    expect(dismissedUntil).toBe(now + pwaInstallNudgeDelayMs);
    expect(readPwaInstallNudgeDismissedUntil()).toBe(dismissedUntil);
    expect(window.localStorage.getItem(pwaInstallNudgeStorageKey)).toBe(String(dismissedUntil));
    expect(
      shouldShowPwaInstallNudge({
        savedEntryCount: 2,
        installed: false,
        platform: 'ios',
        dismissedUntil,
        now: dismissedUntil - 1,
      }),
    ).toBe(false);
  });
});
