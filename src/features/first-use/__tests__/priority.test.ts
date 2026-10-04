import { describe, expect, it } from 'vitest';
import type { FirstUseState } from '@/types';
import { isFirstUsePrimary } from '../priority';

function firstUse(status: FirstUseState['status']): FirstUseState {
  return { status, weekStart: '', periodEnd: '', lastStep: 'choice', overviewSeen: false, updatedAt: '' };
}

describe('first-use priority', () => {
  it.each(['not_started', 'in_progress'] satisfies FirstUseState['status'][])('owns Today while the flow is %s', (status) =>
    expect(isFirstUsePrimary(firstUse(status))).toBe(true),
  );

  it('does not own Today when the optional reminder is available', () => {
    expect(isFirstUsePrimary(firstUse('available'))).toBe(false);
  });

  it('owns Today while completed answers are reopened', () => {
    expect(isFirstUsePrimary(firstUse('completed'), true)).toBe(true);
  });
});
