import type { FirstUseState } from '@/types';

export function isFirstUsePrimary(firstUse: FirstUseState, editRequested = false): boolean {
  return firstUse.status === 'not_started' || firstUse.status === 'in_progress' || (editRequested && firstUse.status === 'completed');
}
