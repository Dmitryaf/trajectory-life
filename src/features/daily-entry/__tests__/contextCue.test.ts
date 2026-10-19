import { describe, expect, it } from 'vitest';
import { resolveTodayContextCue, type TodayContextCueCandidates } from '../contextCue';

const emptyCandidates = (): TodayContextCueCandidates => ({
  firstUse: false,
  recovery: false,
  plan: false,
  pwa: false,
  ai: false,
});

describe('Today context cue priority', () => {
  it.each([
    ['first-use', { firstUse: true, recovery: true, plan: true, pwa: true, ai: true }],
    ['recovery', { recovery: true, plan: true, pwa: true, ai: true }],
    ['plan', { plan: true, pwa: true, ai: true }],
    ['pwa', { pwa: true, ai: true }],
    ['ai', { ai: true }],
  ] as const)('selects %s before lower-priority candidates', (expected, candidates) => {
    expect(resolveTodayContextCue({ ...emptyCandidates(), ...candidates })).toBe(expected);
  });

  it('returns no cue when there is no current context', () => {
    expect(resolveTodayContextCue(emptyCandidates())).toBeNull();
  });
});
