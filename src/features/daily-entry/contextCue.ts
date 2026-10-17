export type TodayContextCue = 'first-use' | 'recovery' | 'plan' | 'pwa' | 'ai' | null;

export interface TodayContextCueCandidates {
  firstUse: boolean;
  recovery: boolean;
  plan: boolean;
  pwa: boolean;
  ai: boolean;
}

const cuePriority: Array<{ cue: Exclude<TodayContextCue, null>; candidate: keyof TodayContextCueCandidates }> = [
  { cue: 'first-use', candidate: 'firstUse' },
  { cue: 'recovery', candidate: 'recovery' },
  { cue: 'plan', candidate: 'plan' },
  { cue: 'pwa', candidate: 'pwa' },
  { cue: 'ai', candidate: 'ai' },
];

export function resolveTodayContextCue(candidates: TodayContextCueCandidates): TodayContextCue {
  return cuePriority.find(({ candidate }) => candidates[candidate])?.cue ?? null;
}
