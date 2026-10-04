export type TodayContextCue = 'first-use' | 'review' | 'recovery' | 'plan' | 'pwa' | 'ai' | 'pulse' | null;

export interface TodayContextCueCandidates {
  firstUse: boolean;
  review: boolean;
  recovery: boolean;
  plan: boolean;
  pwa: boolean;
  ai: boolean;
  pulse: boolean;
}

const cuePriority: Array<{ cue: Exclude<TodayContextCue, null>; candidate: keyof TodayContextCueCandidates }> = [
  { cue: 'first-use', candidate: 'firstUse' },
  { cue: 'review', candidate: 'review' },
  { cue: 'recovery', candidate: 'recovery' },
  { cue: 'plan', candidate: 'plan' },
  { cue: 'pwa', candidate: 'pwa' },
  { cue: 'ai', candidate: 'ai' },
  { cue: 'pulse', candidate: 'pulse' },
];

export function resolveTodayContextCue(candidates: TodayContextCueCandidates): TodayContextCue {
  return cuePriority.find(({ candidate }) => candidates[candidate])?.cue ?? null;
}
