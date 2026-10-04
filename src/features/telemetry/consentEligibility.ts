import type { TelemetryState } from './queue';
export function consentOfferKind(state: TelemetryState, hasExperience: boolean): 'offer' | 'reminder' | null {
  if (!state.available || state.enabled || state.pendingWithdrawal || state.busy) {
    return null;
  }
  if (state.decision === 'undecided' && !state.firstOfferedAt) {
    return 'offer';
  }
  if (!['undecided', 'snoozed'].includes(state.decision ?? '') || !state.firstOfferedAt || state.reminderCount !== 0 || !hasExperience) {
    return null;
  }
  const due = Math.max(Date.parse(state.firstOfferedAt) + 7 * 86_400_000, Date.parse(state.snoozedUntil ?? state.firstOfferedAt));
  return (state.serverNow ?? 0) >= due ? 'reminder' : null;
}
