import { describe, expect, it } from 'vitest';
import { combineDuration, splitDuration } from '../duration';

describe('duration input', () => {
  it('shows durations as hours and minutes', () => {
    expect(splitDuration(390)).toEqual({ hours: 6, minutes: 30 });
    expect(splitDuration(670)).toEqual({ hours: 11, minutes: 10 });
  });

  it('stores hours and minutes as one integer value', () => {
    expect(combineDuration(6, 55, 18 * 60)).toBe(415);
    expect(combineDuration(11, 10, 18 * 60)).toBe(670);
  });

  it('preserves an empty input and bounds invalid minutes', () => {
    expect(combineDuration(null, null, 16 * 60)).toBeNull();
    expect(combineDuration(7, 75, 16 * 60)).toBe(479);
  });
});
