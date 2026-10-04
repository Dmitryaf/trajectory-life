import { describe, expect, it } from 'vitest';
import { resolveTodayContextCue, type TodayContextCueCandidates } from '../contextCue';

const emptyCandidates = (): TodayContextCueCandidates => ({
  firstUse: false,
  review: false,
  recovery: false,
  plan: false,
  pwa: false,
  ai: false,
  pulse: false,
});

describe('Today context cue priority', () => {
  it.each([
    ['first-use', { firstUse: true, review: true, recovery: true, plan: true, pwa: true, ai: true, pulse: true }],
    ['review', { review: true, recovery: true, plan: true, pwa: true, ai: true, pulse: true }],
    ['recovery', { recovery: true, plan: true, pwa: true, ai: true, pulse: true }],
    ['plan', { plan: true, pwa: true, ai: true, pulse: true }],
    ['pwa', { pwa: true, ai: true, pulse: true }],
    ['ai', { ai: true, pulse: true }],
    ['pulse', { pulse: true }],
  ] as const)('selects %s before lower-priority candidates', (expected, candidates) => {
    expect(resolveTodayContextCue({ ...emptyCandidates(), ...candidates })).toBe(expected);
  });

  it('returns no cue when there is no current context', () => {
    expect(resolveTodayContextCue(emptyCandidates())).toBeNull();
  });
});
